"""Stand, bedding and funnel candidates with plain-text reasons and wind advice."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy import ndimage as ndi

from . import factors as F

DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def dir8(deg: float) -> str:
    return DIRS[int(round((deg % 360) / 45)) % 8]


def ang_diff(a: float, b: float) -> float:
    d = abs((a - b) % 360)
    return min(d, 360 - d)


def bearing_px(r0: int, c0: int, r1: float, c1: float) -> float:
    """Compass bearing from pixel (r0,c0) toward (r1,c1). Rows grow southward."""
    return (math.degrees(math.atan2(c1 - c0, -(r1 - r0))) + 360) % 360


def approach_bearing(weight: np.ndarray, r: int, c: int, radius_px: float) -> float | None:
    """Weighted mean direction from (r,c) to where deer are likely coming from."""
    R = int(max(2, radius_px))
    r0, r1 = max(0, r - R), min(weight.shape[0], r + R + 1)
    c0, c1 = max(0, c - R), min(weight.shape[1], c + R + 1)
    w = weight[r0:r1, c0:c1]
    yy, xx = np.mgrid[r0:r1, c0:c1]
    dy, dx = -(yy - r), (xx - c)  # north, east components
    dist = np.hypot(dx, dy)
    keep = (dist > 1) & (dist <= R)
    if not keep.any():
        return None
    ux, uy = dx[keep] / dist[keep], dy[keep] / dist[keep]
    ww = w[keep]
    vx, vy = float((ww * ux).sum()), float((ww * uy).sum())
    if math.hypot(vx, vy) < 1e-6 * max(1.0, float(ww.sum())):
        return None
    return (math.degrees(math.atan2(vx, vy)) + 360) % 360


def wind_advice(theta: float | None) -> dict[str, Any]:
    """Wind FROM the deer side carries scent away from them. Opposite winds are bad."""
    if theta is None:
        return {"approachFrom": None, "goodWinds": [], "okWinds": [], "badWinds": []}
    good, ok, bad = [], [], []
    for i, d in enumerate(DIRS):
        a = ang_diff(i * 45, theta)
        if a <= 45:
            good.append(d)
        elif a <= 100:
            ok.append(d)
        else:
            bad.append(d)
    return {"approachFrom": dir8(theta), "goodWinds": good, "okWinds": ok, "badWinds": bad}


def reasons_at(res: dict[str, Any], r: int, c: int, season: dict[str, Any] | None, n: int = 3) -> list[str]:
    f = res["factors"]
    aux = res["aux"]
    w = season["weights"] if season else {k: 1.0 for k in F.FACTORS}
    contrib = sorted(F.FACTORS, key=lambda k: -w[k] * float(f[k][r, c]))
    out: list[str] = []
    for k in contrib:
        v = float(f[k][r, c])
        if v < 0.35:
            continue
        if k == "food":
            d = float(aux["d_crop"][r, c])
            out.append(f"{d:.0f} m from crop field edge" if math.isfinite(d) and d < 1500 else "hardwood (oak mast proxy)")
        elif k == "cover":
            out.append("thick cover (shrub, wetland thicket or conifer)" if v > 0.75 else "woody cover")
        elif k == "edge":
            out.append("on a woods-to-opening edge")
        elif k == "corridor":
            extra = []
            if aux["narrow"][r, c] > 0.5:
                extra.append("pinch point in cover")
            if aux["saddle"][r, c] > 0:
                extra.append("terrain saddle")
            out.append("modeled travel route between bedding and food" + (f" ({', '.join(extra)})" if extra else ""))
        elif k == "pressure":
            d = min(float(aux["d_road"][r, c]), float(aux["d_parking"][r, c]))
            out.append(f"{d:.0f} m from nearest road or parking" if math.isfinite(d) else "far from roads")
        elif k == "terrain":
            s = float(aux["slope"][r, c])
            if aux["bench"][r, c]:
                out.append("bench on a slope")
            elif aux["leeward"][r, c]:
                out.append(f"leeward {dir8(float(aux['aspect'][r, c]))}-facing slope ({s:.0f}%)")
            else:
                out.append(f"moderate {s:.0f}% slope")
        if len(out) >= n:
            break
    return out or ["moderate overall habitat mix"]


def _lonlat(res: dict[str, Any], r: int, c: int) -> tuple[float, float]:
    lon, lat = res["grid"].pixel_to_lonlat(r, c)
    return round(lon, 6), round(lat, 6)


def build_candidates(res: dict[str, Any], cfg: dict[str, Any]) -> list[dict[str, Any]]:
    cc = cfg["candidates"]
    g = res["g"]
    prop = res["prop"]
    aux = res["aux"]
    f = res["factors"]
    spacing = cc["min_spacing_m"] / g
    radius = cc["approach_radius_m"] / g
    # Where deer come from: bedding cover and travel routes.
    deer_weight = f["cover"] * (0.5 + f["corridor"]) * res["buf"]
    access = res["access"]
    out: list[dict[str, Any]] = []
    sources = res.get("access_sources") or []

    near_woody = ndi.binary_dilation(aux["woody"], iterations=1)

    for sname, season in cfg["seasons"].items():
        score = 0.5 * res["seasons"][sname] + 0.3 * f["corridor"] + 0.2 * f["edge"]
        allowed = prop & near_woody & ~aux["water"]
        for r, c in F.pick_peaks(score, allowed, cc["stands_per_property"], spacing, 0.05):
            theta = approach_bearing(deer_weight, r, c, radius)
            wind = wind_advice(theta)
            entry = None
            if sources:
                pr, pc = min(sources, key=lambda p: (p[0] - r) ** 2 + (p[1] - c) ** 2)
                phi = bearing_px(r, c, pr, pc)
                entry = {
                    "fromDir": dir8(phi),
                    "walkMin": round(float(access[r, c]), 1) if math.isfinite(float(access[r, c])) else None,
                    "crossesDeerSide": theta is not None and ang_diff(phi, theta) < 60,
                }
            lon, lat = _lonlat(res, r, c)
            out.append(
                {
                    "kind": "stand",
                    "season": sname,
                    "lon": lon,
                    "lat": lat,
                    "score": round(float(res["seasons"][sname][r, c]) * 100),
                    "reasons": reasons_at(res, r, c, season),
                    "wind": wind,
                    "entry": entry,
                }
            )

    bed = f["cover"] * 0.5 + f["terrain"] * 0.3 + f["pressure"] * 0.2
    for r, c in F.pick_peaks(bed, prop & (f["cover"] > 0.55), cc["bedding_per_property"], spacing * 1.5, 0.3):
        lon, lat = _lonlat(res, r, c)
        out.append({"kind": "bedding", "lon": lon, "lat": lat, "score": round(float(bed[r, c]) * 100), "reasons": reasons_at(res, r, c, BEDDING_WEIGHTS)})

    fun = res["funnel"] * (0.5 + 0.5 * aux["narrow"]) + 0.3 * aux["saddle"] * f["corridor"]
    for r, c in F.pick_peaks(fun, prop, cc["funnels_per_property"], spacing * 1.5, 0.15):
        lon, lat = _lonlat(res, r, c)
        out.append({"kind": "funnel", "lon": lon, "lat": lat, "score": round(float(min(1.0, fun[r, c])) * 100), "reasons": reasons_at(res, r, c, cfg["seasons"]["rut"])})
    return out


BEDDING_WEIGHTS = {"weights": {"cover": 1.0, "terrain": 0.6, "pressure": 0.6, "food": 0.1, "edge": 0.1, "corridor": 0.1}}

FACTOR_PHRASES = {
    "food": "ag fields within walking range of cover",
    "cover": "thick bedding cover",
    "edge": "lots of woods-to-opening edge",
    "corridor": "converging travel routes",
    "pressure": "interior far from roads and parking",
    "terrain": "useful terrain (benches, leeward slopes, saddles)",
}


def property_summary(res: dict[str, Any], cfg: dict[str, Any], props: dict[str, Any]) -> dict[str, Any]:
    prop = res["prop"]
    frac = cfg["candidates"]["property_score_top_frac"]
    out: dict[str, Any] = {"scores": {}, "reasons": {}}
    for sname, s in res["seasons"].items():
        vals = s[prop]
        if vals.size == 0:
            out["scores"][sname] = 0
            continue
        k = max(1, int(vals.size * frac))
        top_idx = np.argpartition(vals, -k)[-k:]
        out["scores"][sname] = round(float(vals[top_idx].mean()) * 100)
        w = cfg["seasons"][sname]["weights"]
        means = {f: float(res["factors"][f][prop][top_idx].mean()) * w[f] for f in F.FACTORS}
        out["reasons"][sname] = [FACTOR_PHRASES[f] for f in sorted(means, key=lambda x: -means[x])[:3]]
    acc = res["access"][prop]
    acc = acc[np.isfinite(acc)]
    out["walkMin"] = round(float(acc.min()), 1) if acc.size else None
    out["walkMedianMin"] = round(float(np.median(acc)), 1) if acc.size else None
    out["hasParking"] = bool(res["parking_px"])
    return out
