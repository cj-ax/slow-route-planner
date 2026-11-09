"""Download source rasters / vectors onto a property's grid. Every download is cached on disk."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from pathlib import Path
from typing import Any

import numpy as np
import requests
from rasterio import MemoryFile
from rasterio.crs import CRS
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject, transform_bounds

from .grid import Grid

log = logging.getLogger(__name__)
WEB = CRS.from_epsg(3857)
UA = {"User-Agent": "deer-scout-pipeline/1 (personal scouting map)"}
CACHE = Path("pipeline/work/cache")


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update(UA)
    return s


SESSION = _session()


def get(url: str, params: dict[str, Any] | None = None, *, tries: int = 4, timeout: int = 120, cache: bool = True) -> bytes:
    """GET with retries and an on-disk cache keyed by URL + params."""
    key = hashlib.sha1((url + json.dumps(params or {}, sort_keys=True)).encode()).hexdigest()
    path = CACHE / key[:2] / key
    if cache and path.exists():
        return path.read_bytes()
    err: Exception | None = None
    for i in range(tries):
        try:
            r = SESSION.get(url, params=params, timeout=timeout)
            r.raise_for_status()
            if cache:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(r.content)
            return r.content
        except Exception as e:  # noqa: BLE001 - retry anything network-ish
            err = e
            if i < tries - 1:
                time.sleep(2 ** (i + 1))
    raise RuntimeError(f"GET failed {url}: {err}")


def transform_for(grid: Grid):
    minx, miny, maxx, maxy = grid.bounds
    rows, cols = grid.shape
    return from_bounds(minx, miny, maxx, maxy, cols, rows)


def to_grid(data: np.ndarray, src_transform, src_crs, grid: Grid, resampling: Resampling, dtype, nodata=0) -> np.ndarray:
    out = np.full(grid.shape, nodata, dtype=dtype)
    reproject(
        source=data,
        destination=out,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=transform_for(grid),
        dst_crs=WEB,
        resampling=resampling,
        src_nodata=None,
        dst_nodata=nodata,
    )
    return out


def _blocks(grid: Grid, max_px: int = 2048):
    """Split a grid into sub-grids no larger than max_px per side (tile aligned)."""
    step = max_px // 256
    for j in range(0, grid.ny, step):
        for i in range(0, grid.nx, step):
            yield Grid(grid.z, grid.x0 + i, grid.y0 + j, min(step, grid.nx - i), min(step, grid.ny - j)), j * 256, i * 256


def _export_image(url: str, sub: Grid, extra: dict[str, str]) -> bytes:
    minx, miny, maxx, maxy = sub.bounds
    rows, cols = sub.shape
    params = {
        "bbox": f"{minx},{miny},{maxx},{maxy}",
        "bboxSR": "3857",
        "imageSR": "3857",
        "size": f"{cols},{rows}",
        "format": "tiff",
        "f": "image",
        **extra,
    }
    return get(url, params)


def fetch_dem(url: str, grid: Grid) -> np.ndarray:
    out = np.zeros(grid.shape, np.float32)
    for sub, r0, c0 in _blocks(grid):
        raw = _export_image(url, sub, {"pixelType": "F32", "interpolation": "RSP_BilinearInterpolation", "noData": "-9999"})
        with MemoryFile(raw) as mf, mf.open() as ds:
            a = ds.read(1).astype(np.float32)
        h, w = sub.shape
        out[r0 : r0 + h, c0 : c0 + w] = a[:h, :w]
    bad = (out < -1000) | ~np.isfinite(out)
    if bad.any():
        out[bad] = float(np.nanmedian(out[~bad])) if (~bad).any() else 0.0
    return out


# ---- Cropland Data Layer ----

# Standard CDL palette entries for crop classes, used only to decode the
# RGB-rendered MnGeo service when CropScape is unavailable.
CDL_RGB = {
    1: (255, 211, 0),
    4: (255, 158, 10),
    5: (38, 112, 0),
    12: (221, 165, 11),
    13: (221, 165, 11),
    21: (226, 0, 124),
    22: (137, 98, 84),
    23: (216, 181, 107),
    24: (165, 112, 0),
    27: (174, 1, 126),
    28: (160, 89, 137),
    29: (112, 0, 73),
    36: (255, 168, 226),
    37: (165, 245, 141),
    225: (137, 98, 84),
    226: (255, 211, 0),
    254: (38, 112, 0),
}


def rgb_to_cdl(rgb: np.ndarray, tol: float = 18.0) -> np.ndarray:
    """Map an (3, H, W) RGB rendering back to CDL crop codes; non-crop pixels -> 0."""
    codes = np.array(list(CDL_RGB.keys()), np.uint8)
    pal = np.array(list(CDL_RGB.values()), np.float32)  # (K, 3)
    px = rgb.reshape(3, -1).T.astype(np.float32)  # (N, 3)
    out = np.zeros(px.shape[0], np.uint8)
    best = np.full(px.shape[0], np.inf, np.float32)
    for k in range(len(codes)):
        d = np.sqrt(((px - pal[k]) ** 2).sum(1))
        take = (d < best) & (d <= tol)
        out[take] = codes[k]
        best = np.where(take, d, best)
    return out.reshape(rgb.shape[1:])


_CROPSCAPE = {"failures": 0}


def _mngeo_cdl(src: dict[str, Any], grid: Grid) -> np.ndarray:
    out = np.zeros(grid.shape, np.uint8)
    for sub, r0, c0 in _blocks(grid):
        raw = _export_image(src["cdl_mngeo"], sub, {"interpolation": "RSP_NearestNeighbor"})
        with MemoryFile(raw) as mf, mf.open() as ds:
            rgb = ds.read([1, 2, 3])
        h, w = sub.shape
        out[r0 : r0 + h, c0 : c0 + w] = rgb_to_cdl(rgb)[:h, :w]
    return out


def fetch_cdl(src: dict[str, Any], grid: Grid, state: str = "MN") -> tuple[np.ndarray, str]:
    """CDL class codes on the grid. CropScape (raw codes) first, MnGeo RGB fallback.

    CropScape can hang; after two failures it is skipped for the rest of the run.
    """
    if state == "MN":
        # MnGeo is fast and covers Minnesota; CropScape's file service often hangs.
        return _mngeo_cdl(src, grid), "MnGeo CDL 2025 (RGB decoded)"
    minx, miny, maxx, maxy = grid.bounds
    for year in (src["cdl_year"], src["cdl_year"] - 1):
        if _CROPSCAPE["failures"] >= 3:
            break
        try:
            b = transform_bounds(WEB, CRS.from_epsg(5070), minx, miny, maxx, maxy)
            xml = get(src["cdl_cropscape"], {"year": str(year), "bbox": ",".join(f"{v:.0f}" for v in b)}, tries=1, timeout=120).decode()
            m = re.search(r"<returnURL>(.*?)</returnURL>", xml)
            if not m:
                raise RuntimeError(xml[:200])
            raw = get(m.group(1), tries=2, timeout=60)
            with MemoryFile(raw) as mf, mf.open() as ds:
                a = ds.read(1)
                out = to_grid(a, ds.transform, ds.crs, grid, Resampling.nearest, np.uint8)
            if out.any():
                return out, f"CropScape CDL {year}"
        except Exception as e:  # noqa: BLE001
            _CROPSCAPE["failures"] += 1
            log.warning("CropScape %s failed (%d): %s", year, _CROPSCAPE["failures"], str(e)[:200])
    out = _mngeo_cdl(src, grid)
    return out, "MnGeo CDL 2025 (RGB decoded)" if out.any() else "none (NLCD crops used)"


def fetch_nlcd(src: dict[str, Any], grid: Grid) -> np.ndarray:
    minx, miny, maxx, maxy = grid.bounds
    pad = 200
    params = {
        "service": "WCS",
        "version": "2.0.1",
        "request": "GetCoverage",
        "coverageId": src["nlcd_coverage"],
        "subset": [f"X({minx - pad},{maxx + pad})", f"Y({miny - pad},{maxy + pad})"],
        "subsettingCrs": "http://www.opengis.net/def/crs/EPSG/0/3857",
        "outputCrs": "http://www.opengis.net/def/crs/EPSG/0/3857",
        "format": "image/geotiff",
    }
    raw = get(src["nlcd_wcs"], params)  # type: ignore[arg-type]
    with MemoryFile(raw) as mf, mf.open() as ds:
        return to_grid(ds.read(1), ds.transform, ds.crs, grid, Resampling.nearest, np.uint8)


def nwi_code(attr: str) -> int:
    """Collapse a Cowardin code (e.g. PEM1C, PSS1A, PFO1A, L1UBH, PUBG) to our 0..4 classes."""
    a = (attr or "").upper()
    if a.startswith("PSS") or "/SS" in a:
        return 2
    if a.startswith("PFO"):
        return 3
    if a.startswith("PEM"):
        return 1
    if a.startswith(("L", "R", "PUB", "PAB", "M", "E")):
        return 4
    return 0


def fetch_nwi(url: str, grid: Grid) -> np.ndarray:
    minx, miny, maxx, maxy = grid.bounds
    shapes: list[tuple[dict, int]] = []
    offset = 0
    while True:
        params = {
            "geometry": f"{minx},{miny},{maxx},{maxy}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": "3857",
            "outSR": "3857",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "ATTRIBUTE",
            "returnGeometry": "true",
            "maxAllowableOffset": "5",
            "resultOffset": str(offset),
            "resultRecordCount": "1000",
            "f": "geojson",
        }
        fc = json.loads(get(url, params))
        feats = fc.get("features", [])
        for f in feats:
            code = nwi_code((f.get("properties") or {}).get("ATTRIBUTE", ""))
            if code and f.get("geometry"):
                shapes.append((f["geometry"], code))
        if len(feats) < 1000 and not (fc.get("properties") or {}).get("exceededTransferLimit"):
            break
        offset += len(feats)
    if not shapes:
        return np.zeros(grid.shape, np.uint8)
    # Paint water first, then wetland classes on top.
    shapes.sort(key=lambda s: -s[1])
    return rasterize(shapes, out_shape=grid.shape, transform=transform_for(grid), fill=0, dtype="uint8")


def rasterize_geoms(geoms, grid: Grid, all_touched: bool = True) -> np.ndarray:
    geoms = [g for g in geoms if g is not None and not g.is_empty]
    if not geoms:
        return np.zeros(grid.shape, bool)
    return rasterize(
        [(g, 1) for g in geoms], out_shape=grid.shape, transform=transform_for(grid), fill=0, dtype="uint8", all_touched=all_touched
    ).astype(bool)


def fetch_dem_hd(hd_url: str, fallback_url: str, grid: Grid) -> tuple[np.ndarray, str]:
    """MnTopo 1 m lidar DEM, falling back to 3DEP if the state service fails or has gaps."""
    try:
        dem = fetch_dem(hd_url, grid)
        if np.ptp(dem) > 0:
            return dem, "MnTopo 1 m lidar DEM"
    except Exception as e:  # noqa: BLE001
        log.warning("MnTopo DEM failed, using 3DEP: %s", str(e)[:200])
    return fetch_dem(fallback_url, grid), "USGS 3DEP"


def fetch_naip_ndvi_texture(url: str, grid: Grid) -> tuple[np.ndarray, np.ndarray]:
    """NAIP 4-band on the grid -> (NDVI, local std-dev of NIR over a 5x5 window)."""
    from scipy import ndimage as ndi

    ndvi = np.zeros(grid.shape, np.float32)
    tex = np.zeros(grid.shape, np.float32)
    for sub, r0, c0 in _blocks(grid):
        raw = _export_image(url, sub, {"interpolation": "RSP_BilinearInterpolation"})
        with MemoryFile(raw) as mf, mf.open() as ds:
            a = ds.read().astype(np.float32)
        if a.shape[0] < 4:
            raise RuntimeError("NAIP service returned fewer than 4 bands")
        red, nir = a[0], a[3]
        h, w = sub.shape
        nd = (nir - red) / (nir + red + 1e-6)
        sd = np.sqrt(np.maximum(ndi.uniform_filter(nir**2, 5) - ndi.uniform_filter(nir, 5) ** 2, 0))
        ndvi[r0 : r0 + h, c0 : c0 + w] = nd[:h, :w]
        tex[r0 : r0 + h, c0 : c0 + w] = sd[:h, :w]
    return ndvi, tex
