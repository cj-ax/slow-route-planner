import json
from pathlib import Path

import numpy as np
import yaml
from shapely.geometry import box, mapping

from deerscout.cli import compute_hd_ids
from deerscout.grid import Grid
from deerscout.process import PIPELINE_VERSION, choose_grid, compute, q8, refine_cover
from deerscout.tiles import merge

CFG = yaml.safe_load((Path(__file__).parents[1] / "config.yaml").read_text())


def test_refine_cover_adds_treelines_and_clears_openings():
    n = 60
    cover = np.full((n, n), 0.05, np.float32)
    woody = np.zeros((n, n), bool)
    woody[:, 30:] = True
    cover[:, 30:] = 0.6
    opening = ~woody
    ndvi = np.full((n, n), 0.0, np.float32)
    tex = np.zeros((n, n), np.float32)
    ndvi[:, 10:16], tex[:, 10:16] = 0.5, 15.0  # tree line inside the field
    ndvi[:, 30:] = 0.5
    tex[:, 30:] = 15.0
    ndvi[20:40, 40:52], tex[20:40, 40:52] = 0.05, 2.0  # clearing inside the woods
    c, w, o = refine_cover(cover, woody, opening, np.zeros((n, n), bool), ndvi, tex, CFG["hd"], 1.7)
    assert w[30, 13] and c[30, 13] >= 0.7 and not o[30, 13]
    assert not w[30, 46] and o[30, 46] and c[30, 46] <= 0.15
    assert w[5, 55]  # untouched woods stay woody


def test_choose_grid_hd_and_cap():
    small = (-93.29, 45.42, -93.28, 45.43)
    assert choose_grid(small, CFG, hd=False).z == 13
    assert choose_grid(small, CFG, hd=True).z == CFG["hd"]["zoom"]
    capped = {**CFG, "hd": {**CFG["hd"], "max_pixels": 2_000_000}}
    assert choose_grid(small, capped, hd=True).z < CFG["hd"]["zoom"]


def test_compute_hd_ids_overlap_threshold():
    dpa = box(0, 0, 10, 10)
    feats = [
        {"type": "Feature", "geometry": mapping(box(1, 1, 2, 2)), "properties": {"id": "inside"}},
        {"type": "Feature", "geometry": mapping(box(9.99, 0, 20, 10)), "properties": {"id": "touching"}},
        {"type": "Feature", "geometry": mapping(box(30, 30, 31, 31)), "properties": {"id": "outside"}},
    ]
    assert compute_hd_ids(feats, [dpa], 0.05) == ["inside"]


def _save(work: Path, pid: str, grid: Grid, res, hd: bool):
    np.savez_compressed(
        work / f"{pid}.npz",
        grid=np.array([grid.z, grid.x0, grid.y0, grid.nx, grid.ny]),
        prop=res["prop"],
        buf=res["buf"],
        **{f"f_{k}": q8(v) for k, v in res["factors"].items()},
        thermal=q8(res["thermal"]),
        access=np.clip(np.nan_to_num(res["access"], posinf=255), 0, 255).astype(np.uint8),
        **{f"s_{k}": q8(v) for k, v in res["seasons"].items()},
    )
    summ = {"scores": {"early": 50, "rut": 50, "late": 50}, "reasons": {}, "walkMin": 1, "walkMedianMin": 2, "hasParking": True}
    (work / f"{pid}.json").write_text(
        json.dumps({"pipeline_version": PIPELINE_VERSION, "id": pid, "name": pid, "summary": summ, "candidates": [], "grid": list(grid.__dict__.values()), "hd": hd})
    )


def test_merge_splits_standard_and_hd(tmp_path: Path):
    from tests.test_smoke import fixture

    work = tmp_path / "props"
    work.mkdir()
    g13 = Grid(13, 1959, 2960, 1, 1)
    _save(work, "std", g13, compute(fixture(g13), g13, CFG, [(6, 128)]), False)
    g16 = Grid(16, 15780, 23465, 1, 1)
    _save(work, "hd1", g16, compute(fixture(g16), g16, CFG, [(6, 128)]), True)
    meta = merge(work, tmp_path / "out", CFG, {})
    assert meta["counts"]["properties"] == 2 and meta["counts"]["hdTiles"] == 1
    assert meta["hd"]["properties"] == ["hd1"] and meta["hd"]["zoom"]["max"] == 16
    assert (tmp_path / "out" / "hd" / "heat-rut.pmtiles").exists()
    rk = {r["id"]: r for r in json.loads((tmp_path / "out" / "rankings.json").read_text())["properties"]}
    assert rk["hd1"]["hd"] is True and rk["std"]["hd"] is False
