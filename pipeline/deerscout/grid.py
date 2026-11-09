"""Web Mercator tile-aligned grids.

Every property is processed on the zoom-13 pixel grid, so the output arrays can
be cut straight into 256x256 map tiles with no resampling.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

R = 6378137.0
ORIGIN = math.pi * R  # 20037508.342789244
TILE = 256


def res_m(z: int) -> float:
    """Mercator meters per pixel at zoom z."""
    return 2 * ORIGIN / TILE / 2**z


def lonlat_to_merc(lon: float, lat: float) -> tuple[float, float]:
    x = math.radians(lon) * R
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R
    return x, y


def merc_to_lonlat(x: float, y: float) -> tuple[float, float]:
    lon = math.degrees(x / R)
    lat = math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)
    return lon, lat


@dataclass(frozen=True)
class Grid:
    """A block of whole tiles at zoom z: tiles x0..x0+nx-1, y0..y0+ny-1 (XYZ, y down)."""

    z: int
    x0: int
    y0: int
    nx: int
    ny: int

    @property
    def res(self) -> float:
        return res_m(self.z)

    @property
    def shape(self) -> tuple[int, int]:
        return self.ny * TILE, self.nx * TILE

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        """(minx, miny, maxx, maxy) in EPSG:3857."""
        span = TILE * self.res
        minx = -ORIGIN + self.x0 * span
        maxy = ORIGIN - self.y0 * span
        return minx, maxy - self.ny * span, minx + self.nx * span, maxy

    @property
    def center_lat(self) -> float:
        b = self.bounds
        return merc_to_lonlat((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)[1]

    @property
    def ground_res(self) -> float:
        """Approximate ground meters per pixel at the grid's center latitude."""
        return self.res * math.cos(math.radians(self.center_lat))

    def pixel_to_merc(self, row: float, col: float) -> tuple[float, float]:
        minx, _, _, maxy = self.bounds
        return minx + (col + 0.5) * self.res, maxy - (row + 0.5) * self.res

    def merc_to_pixel(self, x: float, y: float) -> tuple[int, int]:
        minx, _, _, maxy = self.bounds
        return int((maxy - y) // self.res), int((x - minx) // self.res)

    def pixel_to_lonlat(self, row: float, col: float) -> tuple[float, float]:
        return merc_to_lonlat(*self.pixel_to_merc(row, col))

    def tiles(self) -> list[tuple[int, int, int, int]]:
        """(x, y, row_offset, col_offset) for each tile in the block."""
        return [
            (self.x0 + i, self.y0 + j, j * TILE, i * TILE)
            for j in range(self.ny)
            for i in range(self.nx)
        ]


def grid_for_bbox(lonlat_bbox: tuple[float, float, float, float], buffer_m: float, z: int) -> Grid:
    """Tile-aligned grid covering a lon/lat bbox plus a ground buffer."""
    w, s, e, n = lonlat_bbox
    x0m, y0m = lonlat_to_merc(w, s)
    x1m, y1m = lonlat_to_merc(e, n)
    scale = 1 / math.cos(math.radians((s + n) / 2))  # ground m -> mercator m
    b = buffer_m * scale
    span = TILE * res_m(z)
    tx0 = math.floor((x0m - b + ORIGIN) / span)
    tx1 = math.floor((x1m + b + ORIGIN) / span)
    ty0 = math.floor((ORIGIN - (y1m + b)) / span)
    ty1 = math.floor((ORIGIN - (y0m - b)) / span)
    return Grid(z, tx0, ty0, tx1 - tx0 + 1, ty1 - ty0 + 1)
