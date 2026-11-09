"""Command line entry point.

  python -m deerscout.cli select --mode pilot|all            -> prints property ids
  python -m deerscout.cli process --shard 0 --of 8 [--mode pilot]
  python -m deerscout.cli merge --out pipeline/out
  python -m deerscout.cli osm --pbf a.pbf --pbf b.pbf
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import yaml

WORK = Path("pipeline/work")
VICTORIA = (-93.6619, 44.8597)

log = logging.getLogger("deerscout")


def load_cfg(path: str = "pipeline/config.yaml") -> dict[str, Any]:
    return yaml.safe_load(Path(path).read_text())


def load_properties() -> list[dict[str, Any]]:
    return json.loads((WORK / "properties.geojson").read_text())["features"]


PILOT_AGENCIES = {"wma", "wpa", "refuge", "state_forest", "county"}


def select(features: list[dict[str, Any]], cfg: dict[str, Any], mode: str) -> list[dict[str, Any]]:
    """Deterministic property selection. Pilot = 3 mid-size units within ~25 mi of Victoria."""
    min_ac = cfg["grid"]["min_acres"]
    feats = [f for f in features if f["properties"]["acres"] >= min_ac]
    if mode == "pilot":
        cand = [
            f for f in feats
            if f["properties"]["distMi"] <= 25 and 150 <= f["properties"]["acres"] <= 2500 and f["properties"]["agency"] in PILOT_AGENCIES
        ]
        # Prefer units where DNR lists deer, then the most mid-size, spread across agencies.
        cand.sort(key=lambda f: (f["properties"]["hunting"] != "listed", abs(f["properties"]["acres"] - 600)))
        picked: list[dict[str, Any]] = []
        for f in cand:
            if len(picked) < 3:
                picked.append(f)
        return picked
    if mode.startswith("ids:"):
        ids = set(mode[4:].split(","))
        return [f for f in feats if f["properties"]["id"] in ids]
    return sorted(feats, key=lambda f: -f["properties"]["acres"])


def shard_of(feats: list[dict[str, Any]], shard: int, of: int) -> list[dict[str, Any]]:
    # Round-robin over size-sorted list balances big and small units across jobs.
    return [f for i, f in enumerate(feats) if i % of == shard]


def cmd_process(a: argparse.Namespace) -> int:
    from .osm import OsmLayers
    from .process import process_property

    cfg = load_cfg()
    feats = shard_of(select(load_properties(), cfg, a.mode), a.shard, a.of)
    osm_path = WORK / "osm" / "osm.parquet"
    osm = OsmLayers(osm_path if osm_path.exists() else None)
    if not osm.available:
        log.warning("OSM layers missing; pressure uses DNR parking only")
    parking_fc = json.loads((WORK / "dnr_parking.geojson").read_text())
    dnr_parking = [tuple(f["geometry"]["coordinates"]) for f in parking_fc["features"]]
    out_dir = WORK / "props"
    out_dir.mkdir(parents=True, exist_ok=True)
    ok = fail = 0
    deadline = time.time() + a.max_minutes * 60
    for i, f in enumerate(feats):
        if time.time() > deadline:
            log.warning("time budget reached after %d properties; rerun resumes from cache", i)
            break
        pid = f["properties"]["id"]
        t0 = time.time()
        try:
            r = process_property(f, cfg, osm, dnr_parking, out_dir)  # type: ignore[arg-type]
            ok += r is not None
            log.info("[%d/%d] %s ok in %.1fs", i + 1, len(feats), pid, time.time() - t0)
        except Exception:  # noqa: BLE001 - one bad property must not kill the shard
            fail += 1
            log.error("[%d/%d] %s FAILED\n%s", i + 1, len(feats), pid, traceback.format_exc(limit=4))
    log.info("shard %d/%d done: %d ok, %d failed", a.shard, a.of, ok, fail)
    return 0 if ok or not feats else 1


def cmd_merge(a: argparse.Namespace) -> int:
    from .tiles import merge

    cfg = load_cfg()
    props = {f["properties"]["id"]: f["properties"] for f in load_properties()}
    meta = merge(WORK / "props", Path(a.out), cfg, props)
    print(json.dumps(meta["counts"]), json.dumps(meta["sizes"]))
    return 0 if meta["counts"]["properties"] else 1


def cmd_select(a: argparse.Namespace) -> int:
    for f in select(load_properties(), load_cfg(), a.mode):
        p = f["properties"]
        print(f'{p["id"]}\t{p["acres"]}ac\t{p["distMi"]:.1f}mi\t{p["name"]}')
    return 0


def cmd_osm(a: argparse.Namespace) -> int:
    from .osm import prepare

    # Bounding box of the 75-mile circle around Victoria (plus margin).
    bbox = (VICTORIA[0] - 1.62, VICTORIA[1] - 1.16, VICTORIA[0] + 1.62, VICTORIA[1] + 1.16)
    print(prepare([Path(p) for p in a.pbf], bbox, WORK / "osm"))
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser(prog="deerscout")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("select")
    s.add_argument("--mode", default="pilot")
    s.set_defaults(fn=cmd_select)
    p = sub.add_parser("process")
    p.add_argument("--shard", type=int, default=0)
    p.add_argument("--of", type=int, default=1)
    p.add_argument("--mode", default="pilot")
    p.add_argument("--max-minutes", type=float, default=280)
    p.set_defaults(fn=cmd_process)
    m = sub.add_parser("merge")
    m.add_argument("--out", default="pipeline/out")
    m.set_defaults(fn=cmd_merge)
    o = sub.add_parser("osm")
    o.add_argument("--pbf", action="append", required=True)
    o.set_defaults(fn=cmd_osm)
    a = ap.parse_args(argv)
    return int(a.fn(a))


if __name__ == "__main__":
    sys.exit(main())
