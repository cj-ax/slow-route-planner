"""OpenStreetMap roads, trails and parking for the study area.

Prep (once per run, in Actions): download Geofabrik extracts, filter with
osmium-tool, write GeoParquet layers in EPSG:3857. Property jobs then read the
small parquet files.

OSM data (c) OpenStreetMap contributors, ODbL 1.0.
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

import geopandas as gpd
from shapely.geometry import box, shape

log = logging.getLogger(__name__)

CAR_ROADS = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "service", "living_street", "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
}
BUSY_TRAILS = {"footway", "cycleway", "bridleway", "pedestrian", "steps"}
QUIET_TRAILS = {"path", "track"}


def classify(tags: dict[str, str]) -> str | None:
    """Return 'road' | 'busy' | 'quiet' | 'parking' | None for an OSM feature's tags."""
    if tags.get("amenity") == "parking":
        return "parking"
    hw = tags.get("highway")
    if not hw:
        return None
    if hw in CAR_ROADS:
        if hw == "service" and tags.get("service") in {"driveway", "parking_aisle"}:
            return None
        return "road"
    if hw in BUSY_TRAILS:
        return "busy"
    if hw in QUIET_TRAILS:
        # Named or designated trails see more people than an unnamed two-track.
        if tags.get("name") or tags.get("foot") == "designated" or tags.get("bicycle") == "designated":
            return "busy"
        return "quiet"
    return None


def prepare(pbfs: list[Path], bbox: tuple[float, float, float, float], out_dir: Path) -> Path:
    """Filter extracts to the study bbox and write osm.parquet (EPSG:3857). Returns the parquet path."""
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    w, s, e, n = bbox
    for pbf in pbfs:
        clipped = out_dir / f"{pbf.stem}.clip.pbf"
        filtered = out_dir / f"{pbf.stem}.filt.pbf"
        seq = out_dir / f"{pbf.stem}.geojsonseq"
        subprocess.run(["osmium", "extract", "-b", f"{w},{s},{e},{n}", str(pbf), "-o", str(clipped), "--overwrite"], check=True)
        subprocess.run(
            ["osmium", "tags-filter", str(clipped), "w/highway", "nwr/amenity=parking", "-o", str(filtered), "--overwrite"],
            check=True,
        )
        subprocess.run(
            ["osmium", "export", str(filtered), "-f", "geojsonseq", "-o", str(seq), "--overwrite", "--geometry-types=point,linestring,polygon"],
            check=True,
        )
        with seq.open() as fh:
            for line in fh:
                line = line.lstrip("\x1e").strip()
                if not line:
                    continue
                f = json.loads(line)
                kind = classify(f.get("properties") or {})
                if not kind:
                    continue
                g = shape(f["geometry"])
                if kind == "parking":
                    g = g.representative_point()
                rows.append({"kind": kind, "geometry": g})
        log.info("%s: %d features so far", pbf.name, len(rows))
    gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs=4326).to_crs(3857)
    path = out_dir / "osm.parquet"
    gdf.to_parquet(path)
    return path


class OsmLayers:
    """Spatial lookups into the prepared parquet (or an empty stand-in when OSM is unavailable)."""

    def __init__(self, path: Path | None):
        self.gdf = gpd.read_parquet(path) if path and path.exists() else None
        if self.gdf is not None:
            _ = self.gdf.sindex  # build the spatial index once

    @property
    def available(self) -> bool:
        return self.gdf is not None

    def query(self, bounds: tuple[float, float, float, float], kind: str):
        if self.gdf is None:
            return []
        idx = self.gdf.sindex.query(box(*bounds))
        sub = self.gdf.iloc[idx]
        return list(sub[sub["kind"] == kind].geometry)
