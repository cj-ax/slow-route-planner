"""Merge per-property outputs into PMTiles archives and small JSON files for the app.

Outputs (in out_dir):
  heat-<season>.pmtiles   palettized PNG heat map, z9-13, inside public land only
  corridors.pmtiles       modeled travel corridors, z9-13, property + buffer
  factors.pmtiles         z13 only, lossless PNG 256x768: three RGB blocks
                          [food,cover,edge] [corridor,pressure,terrain] [thermal,access_min,mask]
  rankings.json           per-property scores, reasons, walk time
  candidates.geojson      stands (per season), bedding, funnels
  meta.json               weights, stretch, encoding, provenance
"""

from __future__ import annotations

import io
import json
import logging
import math
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import write

from .factors import FACTORS
from .grid import ORIGIN, TILE, merc_to_lonlat, res_m

log = logging.getLogger(__name__)

SEASONS = ("early", "rut", "late")
MIN_Z = 9


class TileStore:
    """z13 tiles merged across properties. Data inside a property outranks buffer-only data."""

    def __init__(self) -> None:
        self.prio: dict[tuple[int, int], np.ndarray] = {}
        self.data: dict[tuple[int, int], dict[str, np.ndarray]] = {}

    def add(self, x: int, y: int, prop: np.ndarray, buf: np.ndarray, layers: dict[str, np.ndarray]) -> None:
        pr = np.where(prop, 2, np.where(buf, 1, 0)).astype(np.uint8)
        if not pr.any():
            return
        key = (x, y)
        if key not in self.prio:
            self.prio[key] = pr
            self.data[key] = {k: v.copy() for k, v in layers.items()}
            return
        cur = self.prio[key]
        take = pr > cur
        for k, v in layers.items():
            self.data[key][k][take] = v[take]
        # Overlapping properties: keep the higher heat inside public land.
        both = (pr == 2) & (cur == 2)
        for s in SEASONS:
            k = f"s_{s}"
            self.data[key][k][both] = np.maximum(self.data[key][k][both], layers[k][both])
        self.prio[key] = np.maximum(cur, pr)


def load_npz_into(store: TileStore, path: Path) -> None:
    # Materialize each array once: indexing an NpzFile decompresses the whole array on every access.
    with np.load(path) as npz:
        d = {k: npz[k] for k in npz.files}
    z, x0, y0, nx, ny = (int(v) for v in d["grid"])
    names = [f"f_{k}" for k in FACTORS] + ["thermal", "access"] + [f"s_{s}" for s in SEASONS]
    for j in range(ny):
        for i in range(nx):
            sl = (slice(j * TILE, (j + 1) * TILE), slice(i * TILE, (i + 1) * TILE))
            store.add(x0 + i, y0 + j, d["prop"][sl], d["buf"][sl], {n: d[n][sl] for n in names})


# ---- colors ----

def heat_palette() -> list[tuple[int, int, int, int]]:
    """16 steps, transparent-ish cool to opaque hot. Index 0 is fully transparent."""
    stops = [(0.0, (49, 54, 149)), (0.3, (116, 173, 209)), (0.5, (254, 224, 144)), (0.7, (253, 174, 97)), (0.85, (244, 109, 67)), (1.0, (165, 0, 38))]
    pal = [(0, 0, 0, 0)]
    for i in range(15):
        t = i / 14
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                u = (t - t0) / (t1 - t0)
                rgb = tuple(int(round(c0[k] + u * (c1[k] - c0[k]))) for k in range(3))
                break
        alpha = int(70 + 150 * t)
        pal.append((*rgb, alpha))  # type: ignore[arg-type]
    return pal


PALETTE = heat_palette()


def png_paletted(idx: np.ndarray, palette: list[tuple[int, int, int, int]]) -> bytes:
    im = Image.fromarray(idx.astype(np.uint8), mode="P")
    flat: list[int] = []
    for r, g, b, _ in palette:
        flat += [r, g, b]
    im.putpalette(flat + [0] * (768 - len(flat)))
    im.info["transparency"] = bytes(a for *_, a in palette)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True, transparency=bytes(a for *_, a in palette))
    return buf.getvalue()


def heat_index(score01: np.ndarray, mask: np.ndarray) -> np.ndarray:
    idx = 1 + np.clip(np.floor(score01 * 15), 0, 14)
    return np.where(mask, idx, 0).astype(np.uint8)


CORR_PALETTE = [(0, 0, 0, 0)] + [(122, 30, 160, int(60 + 180 * i / 6)) for i in range(7)]


def corridor_index(c01: np.ndarray, mask: np.ndarray) -> np.ndarray:
    idx = np.clip(np.floor((c01 - 0.3) / 0.7 * 7) + 1, 0, 7)
    return np.where(mask & (c01 >= 0.3), idx, 0).astype(np.uint8)


# ---- pyramid ----

def reduce_max(children: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]], x: int, y: int) -> tuple[np.ndarray, np.ndarray] | None:
    """Combine up to 4 child (value, mask) tiles of parent (x,y) into one by 2x2 masked max."""
    big_v = np.zeros((2 * TILE, 2 * TILE), np.float32)
    big_m = np.zeros((2 * TILE, 2 * TILE), bool)
    any_child = False
    for dy in (0, 1):
        for dx in (0, 1):
            ch = children.get((2 * x + dx, 2 * y + dy))
            if ch is None:
                continue
            any_child = True
            big_v[dy * TILE : (dy + 1) * TILE, dx * TILE : (dx + 1) * TILE] = ch[0]
            big_m[dy * TILE : (dy + 1) * TILE, dx * TILE : (dx + 1) * TILE] = ch[1]
    if not any_child:
        return None
    v = np.where(big_m, big_v, -1).reshape(TILE, 2, TILE, 2).max(axis=(1, 3))
    m = big_m.reshape(TILE, 2, TILE, 2).any(axis=(1, 3))
    return np.where(m, v, 0).astype(np.float32), m


def build_pyramid(base: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]], zmax: int, zmin: int):
    levels = {zmax: base}
    for z in range(zmax - 1, zmin - 1, -1):
        parents = {(x // 2, y // 2) for x, y in levels[z + 1]}
        lv = {}
        for px, py in parents:
            r = reduce_max(levels[z + 1], px, py)
            if r is not None and r[1].any():
                lv[(px, py)] = r
        levels[z] = lv
    return levels


def tile_bounds_lonlat(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    span = TILE * res_m(z)
    minx = -ORIGIN + x * span
    maxy = ORIGIN - y * span
    w, s = merc_to_lonlat(minx, maxy - span)
    e, n = merc_to_lonlat(minx + span, maxy)
    return w, s, e, n


def write_pmtiles(path: Path, tiles: dict[tuple[int, int, int], bytes], name: str, attribution: str) -> int:
    if not tiles:
        return 0
    zs = [k[0] for k in tiles]
    bounds = [tile_bounds_lonlat(*k) for k in tiles if k[0] == max(zs)]
    w = min(b[0] for b in bounds)
    s = min(b[1] for b in bounds)
    e = max(b[2] for b in bounds)
    n = max(b[3] for b in bounds)
    with write(str(path)) as writer:
        for (z, x, y) in sorted(tiles, key=lambda k: zxy_to_tileid(*k)):
            writer.write_tile(zxy_to_tileid(z, x, y), tiles[(z, x, y)])
        writer.finalize(
            {
                "tile_type": TileType.PNG,
                "tile_compression": Compression.NONE,
                "min_lon_e7": int(w * 1e7),
                "min_lat_e7": int(s * 1e7),
                "max_lon_e7": int(e * 1e7),
                "max_lat_e7": int(n * 1e7),
                "center_zoom": min(zs) + 2,
                "center_lon_e7": int((w + e) / 2 * 1e7),
                "center_lat_e7": int((s + n) / 2 * 1e7),
            },
            {"name": name, "attribution": attribution},
        )
    return path.stat().st_size


def write_archives(
    store: TileStore, zmax: int, out_dir: Path, attribution: str, fixed_stretch: dict[str, list[float]] | None = None
) -> tuple[dict[str, int], dict[str, list[float]]]:
    """Heat (per season), corridors and factor archives for one TileStore at zoom zmax."""
    out_dir.mkdir(parents=True, exist_ok=True)
    sizes: dict[str, int] = {}
    stretch: dict[str, list[float]] = {}
    for s in SEASONS:
        if fixed_stretch:
            lo, hi = fixed_stretch[s][0] * 255, fixed_stretch[s][1] * 255
        else:
            vals = np.concatenate([d[f"s_{s}"][store.prio[k] == 2] for k, d in store.data.items()]) if store.data else np.zeros(1)
            lo, hi = (float(np.percentile(vals, 2)), float(np.percentile(vals, 99.5))) if vals.size > 10 else (0.0, 255.0)
        hi = max(hi, lo + 1)
        stretch[s] = [lo / 255, hi / 255]
        base = {k: (np.clip((d[f"s_{s}"].astype(np.float32) - lo) / (hi - lo), 0, 1), store.prio[k] == 2) for k, d in store.data.items()}
        levels = build_pyramid(base, zmax, MIN_Z)
        tiles = {(z, x, y): png_paletted(heat_index(v, m), PALETTE) for z, lv in levels.items() for (x, y), (v, m) in lv.items()}
        sizes[f"heat-{s}"] = write_pmtiles(out_dir / f"heat-{s}.pmtiles", tiles, f"heat-{s}", attribution)

    base = {k: (d["f_corridor"].astype(np.float32) / 255, store.prio[k] >= 1) for k, d in store.data.items()}
    levels = build_pyramid(base, zmax, MIN_Z)
    tiles = {(z, x, y): png_paletted(corridor_index(v, m), CORR_PALETTE) for z, lv in levels.items() for (x, y), (v, m) in lv.items()}
    sizes["corridors"] = write_pmtiles(out_dir / "corridors.pmtiles", tiles, "corridors", attribution)

    ftiles: dict[tuple[int, int, int], bytes] = {}
    for (x, y), d in store.data.items():
        pr = store.prio[(x, y)]
        keep = pr >= 1

        def blk(a, b, c, quant=(True, True, True), keep=keep):
            # 32 levels (step 8) for factors keeps PNGs ~30% smaller; minutes and mask stay exact.
            chans = [np.where(keep, v, 0).astype(np.uint8) & (0xF8 if q else 0xFF) for v, q in zip((a, b, c), quant)]
            return np.stack(chans, axis=-1)

        img = np.concatenate(
            [
                blk(d["f_food"], d["f_cover"], d["f_edge"]),
                blk(d["f_corridor"], d["f_pressure"], d["f_terrain"]),
                blk(d["thermal"], d["access"], np.where(pr == 2, 255, np.where(pr == 1, 128, 0)), (True, False, False)),
            ],
            axis=0,
        )
        buf = io.BytesIO()
        Image.fromarray(img, mode="RGB").save(buf, format="PNG", optimize=True)
        ftiles[(zmax, x, y)] = buf.getvalue()
    sizes["factors"] = write_pmtiles(out_dir / "factors.pmtiles", ftiles, "factors", attribution)
    return sizes, stretch


def merge(work_dir: Path, out_dir: Path, cfg: dict[str, Any], properties: dict[str, Any]) -> dict[str, Any]:
    """Standard-zoom properties go to out_dir; high-detail ones (cfg.hd.zoom) to out_dir/hd.

    The two never overlap, so the app can draw both archive sets at every zoom.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    zstd = int(cfg["grid"]["zoom"])
    zhd = int(cfg.get("hd", {}).get("zoom", 0))
    store, hd_store = TileStore(), TileStore()
    results: list[dict[str, Any]] = []
    hd_ids: list[str] = []
    for js in sorted(work_dir.glob("*.json")):
        try:
            r = json.loads(js.read_text())
        except json.JSONDecodeError:
            continue
        if "summary" not in r:
            continue
        npz = js.with_suffix(".npz")
        if not npz.exists():
            continue
        z = int(r.get("grid", [zstd])[0])
        if z == zstd:
            load_npz_into(store, npz)
        elif z == zhd:
            load_npz_into(hd_store, npz)
            hd_ids.append(r["id"])
        else:
            log.warning("%s: unexpected grid zoom %d, skipped", r["id"], z)
            continue
        results.append(r)
    log.info("merged %d properties: %d z%d tiles, %d high-detail z%d tiles", len(results), len(store.data), zstd, len(hd_store.data), zhd)
    zmax = zstd
    attribution = "Deer Scout model from USGS 3DEP, MnTopo lidar, USDA NAIP, USDA NASS CDL, MRLC NLCD, USFWS NWI, PAD-US, MN DNR, (c) OpenStreetMap contributors"
    sizes, stretch = write_archives(store, zstd, out_dir, attribution)
    hd_meta = None
    if hd_store.data:
        hd_sizes, _ = write_archives(hd_store, zhd, out_dir / "hd", attribution, fixed_stretch=stretch)
        sizes.update({f"hd/{k}": v for k, v in hd_sizes.items()})
        b = [tile_bounds_lonlat(zhd, x, y) for x, y in hd_store.data]
        hd_meta = {
            "zoom": {"min": MIN_Z, "max": zhd},
            "dpas": cfg["hd"].get("dpas", []),
            "properties": sorted(hd_ids),
            "bounds": [min(v[0] for v in b), min(v[1] for v in b), max(v[2] for v in b), max(v[3] for v in b)],
            "groundResolutionM": round(res_m(zhd) * math.cos(math.radians(45.4)), 1),
        }

    rankings = []
    features = []
    for r in results:
        p = properties.get(r["id"], {})
        rankings.append({"id": r["id"], "name": r.get("name"), **r["summary"], "sources": r.get("sources", {}), "hd": bool(r.get("hd"))})
        for cnd in r["candidates"]:
            props = {k: v for k, v in cnd.items() if k not in ("lon", "lat")}
            props["pid"] = r["id"]
            props["pname"] = r.get("name") or p.get("name")
            features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [cnd["lon"], cnd["lat"]]}, "properties": props})
    (out_dir / "rankings.json").write_text(json.dumps({"properties": rankings}, separators=(",", ":")))
    (out_dir / "candidates.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))

    meta = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "configVersion": cfg.get("version"),
        "zoom": {"min": MIN_Z, "max": zmax},
        "seasons": {k: {"label": v["label"], "weights": v["weights"], "thermalMix": v.get("thermal_mix", 0)} for k, v in cfg["seasons"].items()},
        "stretch": stretch,
        "factors": list(FACTORS),
        "factorEncoding": {
            "tileHeight": 3 * TILE,
            "blocks": [["food", "cover", "edge"], ["corridor", "pressure", "terrain"], ["thermal", "accessMinutes", "mask"]],
            "scale": "0..255 = 0..1, except accessMinutes (raw minutes, 255 = unknown/over cap) and mask (255 property, 128 buffer)",
        },
        "counts": {"properties": len(results), "z13Tiles": len(store.data), "hdTiles": len(hd_store.data), "candidates": len(features)},
        "hd": hd_meta,
        "sizes": sizes,
        "groundResolutionM": round(res_m(zmax) * math.cos(math.radians(44.86)), 1),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=1))
    return meta
