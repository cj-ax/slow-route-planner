"""Score one property: fetch inputs on its grid, compute factors, pick candidates, save outputs."""

from __future__ import annotations

import json
import logging
import math
import time
from pathlib import Path
from typing import Any

import numpy as np
from scipy import ndimage as ndi
from shapely.geometry import shape
from shapely.ops import transform as shp_transform

from . import factors as F
from .candidates import build_candidates, property_summary
from .fetch import fetch_cdl, fetch_dem, fetch_dem_hd, fetch_naip_ndvi_texture, fetch_nlcd, fetch_nwi, rasterize_geoms
from .grid import Grid, grid_for_bbox, lonlat_to_merc
from .osm import OsmLayers

log = logging.getLogger(__name__)

PIPELINE_VERSION = 4  # bump to invalidate cached per-property outputs


def to_merc(geom):
    return shp_transform(lambda x, y, z=None: lonlat_to_merc_arr(x, y), geom)


def lonlat_to_merc_arr(x, y):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    mx = np.radians(x) * 6378137.0
    my = np.log(np.tan(np.pi / 4 + np.radians(y) / 2)) * 6378137.0
    return mx, my


def q8(a: np.ndarray) -> np.ndarray:
    return np.clip(np.round(a * 255), 0, 255).astype(np.uint8)


BASE_RES_M = 13.5


def refine_cover(
    cover: np.ndarray, woody: np.ndarray, opening: np.ndarray, water: np.ndarray, ndvi: np.ndarray, tex: np.ndarray, hc: dict[str, Any], g: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Sharpen 30 m land cover with NAIP: tree lines and brush in fields become cover,
    clearings and plots inside woods become openings."""
    fine_woody = (ndvi > hc["ndvi_woody"]) & (tex > hc["tex_woody"])
    fine_open = ndvi < hc["ndvi_open"]
    # Majority filter (5x5) removes speckle.
    fine_woody = ndi.uniform_filter(fine_woody.astype(np.float32), 5) > 0.5
    fine_open = ndi.uniform_filter(fine_open.astype(np.float32), 5) > 0.5
    # Ignore patches smaller than ~min_patch_m2 (single trees, small gaps) so edges stay meaningful.
    from skimage.morphology import remove_small_holes, remove_small_objects

    min_px = max(4, int(hc.get("min_patch_m2", 400) / (g * g)))
    added = remove_small_objects(fine_woody & ~woody & ~water, min_size=min_px)
    cleared = remove_small_objects(fine_open & woody & ~water, min_size=min_px)
    cover = cover.copy()
    cover[added] = np.maximum(cover[added], hc["treeline_cover"])
    cover[cleared] = np.minimum(cover[cleared], hc["clearing_cover"])
    woody = remove_small_holes((woody | added) & ~cleared, area_threshold=min_px)
    opening = (opening | cleared) & ~added & ~woody
    return cover.astype(np.float32), woody, opening


def compute(inputs: dict[str, np.ndarray], grid: Grid, cfg: dict[str, Any], parking_px: list[tuple[int, int]]) -> dict[str, Any]:
    """All factor math for one grid. Separated from I/O so it can run on fixtures."""
    g = grid.ground_res
    dem, nlcd, cdl, nwi = inputs["dem"], inputs["nlcd"], inputs["cdl"], inputs["nwi"]
    roads, busy, quiet = inputs["roads"], inputs["busy"], inputs["quiet"]
    prop, buf = inputs["prop"], inputs["buf"]

    slope, aspect = F.slope_aspect(dem, g)
    crop = F.isin(cdl, cfg["food"]["crop_codes"])
    if not cdl.any():
        # No CDL coverage (e.g. Wisconsin when CropScape is down): NLCD cultivated crops and hay.
        crop = F.isin(nlcd, F.PASTURE_CROP)
    water = F.isin(nlcd, F.WATER) | (nwi == F.NWI_WATER)
    developed = F.isin(nlcd, F.DEVELOPED)
    woody = F.isin(nlcd, F.FOREST + F.WOODY_WETLAND + F.SHRUB) | np.isin(nwi, [F.NWI_SHRUB, F.NWI_FORESTED])
    opening = (crop | F.isin(nlcd, F.PASTURE_CROP + F.GRASS + F.EMERGENT_WETLAND) | (nwi == F.NWI_EMERGENT)) & ~woody

    food, d_crop = F.food_factor(crop, F.isin(nlcd, F.DECIDUOUS).astype(np.float32), g, cfg["food"])
    cover = F.cover_factor(nlcd, nwi, cfg["cover"])
    if "ndvi" in inputs:
        cover, woody, opening = refine_cover(cover, woody, opening, water, inputs["ndvi"], inputs["tex"], cfg["hd"], g)
    terrain, tdetail = F.terrain_factor(dem, slope, aspect, g, cfg["terrain"])
    thermal = F.thermal_factor(aspect, slope, nlcd, cover)
    edge = F.edge_factor(woody, opening, g, cfg["edge"])

    parking_mask = np.zeros(grid.shape, bool)
    for r, c in parking_px:
        parking_mask[r, c] = True
    d_road = F.dist_to(roads, g)
    d_parking = F.dist_to(parking_mask, g)
    d_busy = F.dist_to(busy, g)
    d_quiet = F.dist_to(quiet, g)
    pressure = F.pressure_factor(d_road, d_parking, d_busy, d_quiet, cfg["pressure"])

    # Corridors: least-cost paths from modeled bedding to food edges.
    cc = cfg["corridor"]
    spacing = cc["min_spacing_m"] / g
    bed_score = cover * (0.5 + 0.5 * pressure) * (0.7 + 0.3 * terrain)
    beds = F.pick_peaks(bed_score, buf & (cover > 0.55) & ~water, cc["max_bedding"], spacing, 0.3)
    food_edge = crop & ndi.binary_dilation(woody | (cover > 0.5), iterations=2)
    food_pts = F.pick_peaks(ndi.gaussian_filter(food_edge.astype(np.float32), 2), buf & food_edge, cc["max_food"], spacing, 0.01)
    if not food_pts:  # no ag nearby: use openings as feeding areas
        open_edge = opening & ndi.binary_dilation(woody, iterations=2)
        food_pts = F.pick_peaks(ndi.gaussian_filter(open_edge.astype(np.float32), 2), buf & open_edge, cc["max_food"], spacing, 0.01)
    cost = F.movement_cost(cover, slope, water, developed, roads, cc["cost"])
    # Smoothing is defined in base-grid (~13.5 m) pixels; scale it for finer grids.
    res_scale = max(1.0, BASE_RES_M / g)
    corr = F.corridor_factor(cost, beds, food_pts, cc["links_per_bed"], cc["smooth_px"])
    if res_scale > 1.5:
        corr = ndi.gaussian_filter(corr, cc["smooth_px"] * res_scale * 0.5)
        corr = corr / corr.max() if corr.max() > 0 else corr
    narrow = F.narrowness(woody, g)
    funnel = np.clip(corr * (0.5 + 0.5 * narrow) + 0.5 * tdetail["saddle"] * corr.clip(0.2, 1), 0, 1)
    corridor = np.clip(0.75 * corr + 0.25 * funnel, 0, 1).astype(np.float32)

    # Access: walking minutes from parking (or road edge when there is no known lot).
    ac = cfg["access"]
    walk_cost = F.tobler_minutes_cost(slope, water, g, ac["water_cost_mult"])
    sources = list(parking_px)
    if not sources:  # no known lot: assume roadside parking anywhere along a road
        road_px = np.argwhere(roads)
        step = max(1, len(road_px) // 400)
        sources = [(int(r), int(c)) for r, c in road_px[::step]]
    access = F.access_minutes(walk_cost, sources, ac["max_minutes"])

    fac = {"food": food, "cover": cover, "edge": edge, "corridor": corridor, "pressure": pressure, "terrain": terrain}
    seasons = {name: F.season_score(fac, s, thermal) for name, s in cfg["seasons"].items()}

    return {
        "factors": fac,
        "thermal": thermal,
        "access": access,
        "seasons": seasons,
        "corridor_raw": corr,
        "funnel": funnel,
        "aux": {
            "slope": slope,
            "aspect": aspect,
            "d_crop": d_crop,
            "d_road": d_road,
            "d_parking": d_parking,
            "d_busy": d_busy,
            "woody": woody,
            "water": water,
            "bench": tdetail["bench"],
            "saddle": tdetail["saddle"],
            "leeward": tdetail["leeward"],
            "narrow": narrow,
        },
        "beds": beds,
        "foods": food_pts,
        "prop": prop,
        "buf": buf,
        "grid": grid,
        "g": g,
        "parking_px": parking_px,
        "access_sources": sources,
    }


def choose_grid(bounds: tuple[float, float, float, float], cfg: dict[str, Any], hd: bool) -> Grid:
    """Standard z13 grid, or the finest high-detail zoom that stays under the pixel cap."""
    gc = cfg["grid"]
    if hd:
        hc = cfg["hd"]
        for z in range(int(hc["zoom"]), int(gc["zoom"]), -1):
            g = grid_for_bbox(bounds, gc["buffer_m"], z)
            if g.shape[0] * g.shape[1] <= hc["max_pixels"]:
                return g
    return grid_for_bbox(bounds, gc["buffer_m"], gc["zoom"])


def process_property(
    feature: dict[str, Any], cfg: dict[str, Any], osm: OsmLayers, dnr_parking: list[tuple[float, float]], out_dir: Path, hd: bool = False
) -> dict[str, Any] | None:
    props = feature["properties"]
    pid = props["id"]
    out_json = out_dir / f"{pid}.json"
    geom = shape(feature["geometry"])
    if geom.is_empty:
        return None
    gc = cfg["grid"]
    grid = choose_grid(geom.bounds, cfg, hd)
    if out_json.exists():
        prev = json.loads(out_json.read_text())
        # Reuse cached output unless the version or the detail level changed.
        if prev.get("pipeline_version") == PIPELINE_VERSION and prev.get("grid", [None])[0] == grid.z:
            return prev
    if not hd and max(grid.nx, grid.ny) > gc["max_tiles_side"]:
        log.warning("%s: grid %dx%d too large, skipping", pid, grid.nx, grid.ny)
        return None

    mgeom = to_merc(geom)
    scale = 1 / math.cos(math.radians(grid.center_lat))
    prop_mask = rasterize_geoms([mgeom], grid, all_touched=False)
    if not prop_mask.any():
        prop_mask = rasterize_geoms([mgeom], grid, all_touched=True)
    buf_mask = rasterize_geoms([mgeom.buffer(gc["buffer_m"] * scale)], grid, all_touched=True)

    src = cfg["sources"]
    t = time.time()
    dem_src = "USGS 3DEP"
    extra: dict[str, np.ndarray] = {}
    if hd:
        dem, dem_src = fetch_dem_hd(cfg["hd"]["dem"], src["dem"], grid)
        try:
            extra["ndvi"], extra["tex"] = fetch_naip_ndvi_texture(cfg["hd"]["naip"], grid)
        except Exception as e:  # noqa: BLE001 - HD still works on DEM detail alone
            log.warning("%s: NAIP refinement skipped: %s", pid, str(e)[:200])
    else:
        dem = fetch_dem(src["dem"], grid)
    t_dem = time.time()
    cdl, cdl_src = fetch_cdl(src, grid, props.get("state") or "MN")
    t_cdl = time.time()
    nlcd = fetch_nlcd(src, grid)
    t_nlcd = time.time()
    nwi = fetch_nwi(src["nwi"], grid)
    t_nwi = time.time()

    b = grid.bounds
    roads = rasterize_geoms(osm.query(b, "road"), grid)
    busy = rasterize_geoms(osm.query(b, "busy"), grid)
    quiet = rasterize_geoms(osm.query(b, "quiet"), grid)

    parking_px: list[tuple[int, int]] = []
    rows, cols = grid.shape
    pts = [lonlat_to_merc(lon, lat) for lon, lat in dnr_parking] + [(p.x, p.y) for p in osm.query(b, "parking")]
    for x, y in pts:
        r, c = grid.merc_to_pixel(x, y)
        if 0 <= r < rows and 0 <= c < cols:
            parking_px.append((r, c))

    res = compute(
        {"dem": dem, "nlcd": nlcd, "cdl": cdl, "nwi": nwi, "roads": roads, "busy": busy, "quiet": quiet, "prop": prop_mask, "buf": buf_mask, **extra},
        grid,
        cfg,
        parking_px,
    )
    t_comp = time.time()
    log.info(
        "%s z%d grid %dx%d tiles | dem %.1fs cdl %.1fs (%s) nlcd %.1fs nwi %.1fs compute %.1fs",
        pid, grid.z, grid.nx, grid.ny, t_dem - t, t_cdl - t_dem, cdl_src, t_nlcd - t_cdl, t_nwi - t_nlcd, t_comp - t_nwi,
    )
    cands = build_candidates(res, cfg)
    summary = property_summary(res, cfg, props)

    np.savez_compressed(
        out_dir / f"{pid}.npz",
        grid=np.array([grid.z, grid.x0, grid.y0, grid.nx, grid.ny]),
        prop=prop_mask,
        buf=buf_mask,
        **{f"f_{k}": q8(v) for k, v in res["factors"].items()},
        thermal=q8(res["thermal"]),
        access=np.clip(np.nan_to_num(res["access"], posinf=255), 0, 255).astype(np.uint8),
        **{f"s_{k}": q8(v) for k, v in res["seasons"].items()},
    )
    out = {
        "pipeline_version": PIPELINE_VERSION,
        "id": pid,
        "name": props.get("name"),
        "summary": summary,
        "candidates": cands,
        "sources": {"cdl": cdl_src, "osm": osm.available, "dem": dem_src, "naip": "ndvi" in extra},
        "hd": hd,
        "grid": [grid.z, grid.x0, grid.y0, grid.nx, grid.ny],
    }
    out_json.write_text(json.dumps(out))
    return out
