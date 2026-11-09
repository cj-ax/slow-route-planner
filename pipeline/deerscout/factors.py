"""Scoring factors. Pure numpy functions on co-registered grids, each returning 0..1.

Grids are rows x cols arrays on the same pixel grid; `g` is ground meters per pixel.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy import ndimage as ndi
from skimage.graph import MCP_Geometric

Cfg = dict[str, Any]
F32 = np.float32

# NLCD classes
WATER = (11,)
DEVELOPED = (21, 22, 23, 24)
FOREST = (41, 42, 43)
DECIDUOUS = (41,)
CONIFER = (42, 43)
SHRUB = (52,)
GRASS = (71,)
PASTURE_CROP = (81, 82)
WOODY_WETLAND = (90,)
EMERGENT_WETLAND = (95,)

# NWI raster codes produced by fetch.rasterize_nwi
NWI_NONE, NWI_EMERGENT, NWI_SHRUB, NWI_FORESTED, NWI_WATER = 0, 1, 2, 3, 4


def isin(a: np.ndarray, codes: tuple[int, ...] | list[int]) -> np.ndarray:
    return np.isin(a, np.asarray(codes))


def dist_to(mask: np.ndarray, g: float) -> np.ndarray:
    """Ground distance (m) from every cell to the nearest True cell (inf if none)."""
    if not mask.any():
        return np.full(mask.shape, np.inf, F32)
    return (ndi.distance_transform_edt(~mask) * g).astype(F32)


def slope_aspect(dem: np.ndarray, g: float) -> tuple[np.ndarray, np.ndarray]:
    """Slope in percent and aspect in degrees (direction the slope faces, 0 = N, clockwise)."""
    dz_dy, dz_dx = np.gradient(dem.astype(np.float64), g)
    # rows increase southward, so north component of the downhill direction is +dz_dy
    slope = np.hypot(dz_dx, dz_dy) * 100
    aspect = (np.degrees(np.arctan2(-dz_dx, dz_dy)) + 360) % 360
    return slope.astype(F32), aspect.astype(F32)


def ramp(x: np.ndarray, x0: float, x1: float) -> np.ndarray:
    """0 at x0, 1 at x1, linear, clipped."""
    return np.clip((x - x0) / (x1 - x0), 0, 1).astype(F32)


def food_factor(crop: np.ndarray, deciduous: np.ndarray, g: float, c: Cfg) -> tuple[np.ndarray, np.ndarray]:
    """Proximity to preferred crops, best ~100-400 m from the ag edge, plus a small oak-mast bonus.

    Returns (factor, distance-to-crop in m).
    """
    d = dist_to(crop, g)
    f = np.zeros(crop.shape, F32)
    near = (d > 0) & (d < c["ramp_m"])
    f[near] = 0.6 + 0.4 * d[near] / c["ramp_m"]
    best = (d >= c["ramp_m"]) & (d <= c["best_max_m"])
    f[best] = 1.0
    far = (d > c["best_max_m"]) & np.isfinite(d)
    f[far] = 1 - ramp(d[far], c["best_max_m"], c["zero_at_m"])
    f[crop] = c["in_field"]
    f = np.clip(f + c["oak_bonus"] * deciduous, 0, 1)
    return f.astype(F32), d


def cover_factor(nlcd: np.ndarray, nwi: np.ndarray, c: Cfg) -> np.ndarray:
    """Dense woody / shrub / wetland-thicket cover."""
    f = np.zeros(nlcd.shape, F32)
    for code, v in c["nlcd"].items():
        f[nlcd == int(code)] = v
    f = np.maximum(f, np.where(nwi == NWI_SHRUB, c["nwi_scrub_shrub"], 0))
    f = np.maximum(f, np.where(nwi == NWI_EMERGENT, c["nwi_emergent"], 0))
    f = np.maximum(f, np.where(nwi == NWI_FORESTED, c["nwi_forested"], 0))
    f[(nwi == NWI_WATER) | isin(nlcd, WATER)] = 0
    if c.get("smooth_px"):
        f = ndi.gaussian_filter(f, c["smooth_px"])
    return np.clip(f, 0, 1).astype(F32)



def terrain_factor(
    dem: np.ndarray, slope: np.ndarray, aspect: np.ndarray, g: float, c: Cfg
) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """Moderate slopes, benches, ridge points / saddles, leeward aspects."""
    slope_ok = ((slope >= c["slope_good_min_pct"]) & (slope <= c["slope_good_max_pct"])).astype(F32)

    # Box means (uniform_filter) instead of disk convolutions: same idea, O(1) per pixel.
    ctx = ndi.uniform_filter(slope, size=int(2 * round(c["bench_radius_m"] / g) + 1), mode="nearest")
    bench = ((slope < c["bench_max_pct"]) & (ctx > c["bench_context_pct"])).astype(F32)

    tpi = dem - ndi.uniform_filter(dem.astype(F32), size=int(2 * round(c["tpi_radius_m"] / g) + 1), mode="nearest")
    ridge = ((tpi > 2.0) & (slope < 15)).astype(F32)

    # Saddles: the local Hessian has curvature of opposite sign along the two axes.
    # Smooth over ~25 m so 1 m lidar micro-relief does not read as saddles.
    sm = ndi.gaussian_filter(dem.astype(np.float64), max(2.0, 25.0 / g))
    gy, gx = np.gradient(sm, g)
    gyy, gyx = np.gradient(gy, g)
    gxy, gxx = np.gradient(gx, g)
    det = gxx * gyy - gxy * gyx
    relief = ndi.maximum_filter(dem, size=int(max(3, 200 / g))) - ndi.minimum_filter(dem, size=int(max(3, 200 / g)))
    saddle = ((det < -1e-6) & (relief > 6)).astype(F32)

    lo, hi = c["leeward_aspect"]
    leeward = ((aspect >= lo) & (aspect <= hi) & (slope > 3)).astype(F32)

    w = c["weights"]
    t = (
        w["slope"] * slope_ok
        + w["bench"] * bench
        + w["ridge_saddle"] * np.maximum(ridge, saddle)
        + w["leeward"] * leeward
    )
    return np.clip(t, 0, 1).astype(F32), {"bench": bench, "ridge": ridge, "saddle": saddle, "leeward": leeward, "slope_ok": slope_ok}


def thermal_factor(aspect: np.ndarray, slope: np.ndarray, nlcd: np.ndarray, cover: np.ndarray) -> np.ndarray:
    """Late-season thermal cover: south-facing slopes and conifers."""
    south = ((aspect >= 135) & (aspect <= 225) & (slope > 3)).astype(F32)
    conifer = isin(nlcd, CONIFER).astype(F32)
    return np.clip(0.6 * south * np.maximum(cover, 0.3) + 0.5 * conifer, 0, 1).astype(F32)


def edge_factor(woody: np.ndarray, opening: np.ndarray, g: float, c: Cfg) -> np.ndarray:
    """Woody cover meeting ag, clearings, or wetland. Decays with distance from the edge line."""
    st = ndi.generate_binary_structure(2, 2)
    boundary = (woody & ndi.binary_dilation(opening, st)) | (opening & ndi.binary_dilation(woody, st))
    if not boundary.any():
        return np.zeros(woody.shape, F32)
    d = dist_to(boundary, g)
    return np.exp(-d / c["decay_m"]).astype(F32)


def pressure_factor(
    d_road: np.ndarray, d_parking: np.ndarray, d_busy: np.ndarray, d_quiet: np.ndarray, c: Cfg
) -> np.ndarray:
    """Reward distance from roads and parking (diminishing past ~400 m to 1 km); penalize busy trails."""
    near = np.minimum(d_road, d_parking)
    f = np.clip(near / c["full_at_m"], 0, 1) ** c["exponent"]
    f = np.where(d_busy < c["busy_trail_m"], f * c["busy_trail_factor"], f)
    f = np.where(d_quiet < c["quiet_trail_m"], f * c["quiet_trail_factor"], f)
    return f.astype(F32)


def movement_cost(
    cover: np.ndarray, slope: np.ndarray, water: np.ndarray, developed: np.ndarray, road: np.ndarray, c: Cfg
) -> np.ndarray:
    """Per-cell cost of deer movement: cheap through cover, expensive across open, water, roads."""
    cost = c["base"] + c["open_penalty"] * (1 - cover)
    cost = cost + np.where(slope > c["steep_pct"], c["steep_penalty"], 0)
    cost = np.where(road, cost + c["road"], cost)
    cost = np.where(developed, cost + c["developed"], cost)
    cost = np.where(water, c["water"], cost)
    return cost.astype(np.float64)


def pick_peaks(score: np.ndarray, allowed: np.ndarray, n: int, spacing_px: float, min_value: float = 0.0) -> list[tuple[int, int]]:
    """Greedy top-n cells at least `spacing_px` apart, restricted to `allowed`."""
    s = np.where(allowed, score, -np.inf)
    order = np.argsort(s, axis=None)[::-1]
    picked: list[tuple[int, int]] = []
    sp2 = spacing_px**2
    for idx in order[: max(5000, n * 400)]:
        v = s.flat[idx]
        if not np.isfinite(v) or v < min_value:
            break
        r, col = divmod(int(idx), s.shape[1])
        if all((r - pr) ** 2 + (col - pc) ** 2 >= sp2 for pr, pc in picked):
            picked.append((r, col))
            if len(picked) >= n:
                break
    return picked


MAX_SEARCH_CELLS = 1_500_000


def coarsen_factor(shape: tuple[int, int], max_cells: int | None = None) -> int:
    """Integer block size that brings a grid under max_cells for graph searches."""
    cells = max_cells or MAX_SEARCH_CELLS
    return max(1, int(np.ceil(np.sqrt(shape[0] * shape[1] / cells))))


def block_mean(a: np.ndarray, k: int) -> np.ndarray:
    if k == 1:
        return a
    h, w = a.shape
    H, W = -(-h // k) * k, -(-w // k) * k
    p = np.pad(a, ((0, H - h), (0, W - w)), mode="edge")
    return p.reshape(H // k, k, W // k, k).mean(axis=(1, 3))


def upsample(a: np.ndarray, k: int, shape: tuple[int, int]) -> np.ndarray:
    if k == 1:
        return a
    return np.kron(a, np.ones((k, k), a.dtype))[: shape[0], : shape[1]]


def corridor_factor(
    cost: np.ndarray, beds: list[tuple[int, int]], foods: list[tuple[int, int]], links: int, smooth_px: float
) -> np.ndarray:
    """Accumulate least-cost paths from each bedding point to its cheapest food points.

    Large grids are searched on a coarsened cost surface and upsampled.
    """
    k = coarsen_factor(cost.shape)
    if k > 1:
        small = corridor_factor(
            block_mean(cost, k), [(r // k, c // k) for r, c in beds], [(r // k, c // k) for r, c in foods], links, max(0.5, smooth_px / k)
        )
        return upsample(small, k, cost.shape)
    counts = np.zeros(cost.shape, F32)
    if not beds or not foods:
        return counts
    for b in beds:
        mcp = MCP_Geometric(cost, fully_connected=True)
        costs, _ = mcp.find_costs([b])
        reach = sorted(foods, key=lambda f: costs[f])[:links]
        for f in reach:
            if not np.isfinite(costs[f]):
                continue
            path = mcp.traceback(f)
            rr, cc = zip(*path)
            counts[list(rr), list(cc)] += 1
    if smooth_px:
        counts = ndi.gaussian_filter(counts, smooth_px)
    m = counts.max()
    return (counts / m).astype(F32) if m > 0 else counts


def narrowness(woody: np.ndarray, g: float, width_m: float = 80.0) -> np.ndarray:
    """1 where a woody strip is narrow (a pinch point), fading to 0 for wide blocks."""
    half = ndi.distance_transform_edt(woody) * g
    local_max = ndi.maximum_filter(half, size=int(max(3, 2 * width_m / g)))
    return np.where(woody, 1 - ramp(local_max, width_m / 4, width_m), 0).astype(F32)


def tobler_minutes_cost(slope_pct: np.ndarray, water: np.ndarray, g: float, water_mult: float) -> np.ndarray:
    """Minutes to cross one pixel on foot (Tobler's hiking function), water heavily penalized."""
    v_kmh = 6 * np.exp(-3.5 * np.abs(slope_pct / 100 + 0.05))
    minutes = (g / 1000) / np.maximum(v_kmh, 0.3) * 60
    return np.where(water, minutes * water_mult, minutes).astype(np.float64)


def access_minutes(cost: np.ndarray, sources: list[tuple[int, int]], cap: float) -> np.ndarray:
    if not sources:
        return np.full(cost.shape, np.inf, F32)
    k = coarsen_factor(cost.shape)
    if k > 1:
        # Coarse cell cost = mean fine cost x k (minutes to cross k fine cells).
        small = access_minutes(block_mean(cost, k) * k, sorted({(r // k, c // k) for r, c in sources}), cap)
        return upsample(small, k, cost.shape)
    mcp = MCP_Geometric(cost, fully_connected=True)
    costs, _ = mcp.find_costs(sources)
    return np.minimum(costs, cap * 10).astype(F32)


FACTORS = ("food", "cover", "edge", "corridor", "pressure", "terrain")


def season_score(f: dict[str, np.ndarray], season: Cfg, thermal: np.ndarray) -> np.ndarray:
    w = season["weights"]
    mix = season.get("thermal_mix", 0.0)
    total = np.zeros_like(f["food"])
    for k in FACTORS:
        v = f[k]
        if k == "cover" and mix:
            v = (1 - mix) * v + mix * thermal
        total = total + w[k] * v
    return (total / sum(w.values())).astype(F32)
