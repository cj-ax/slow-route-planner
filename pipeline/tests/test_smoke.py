"""End-to-end smoke test on a synthetic fixture: compute -> candidates -> npz -> merge -> PMTiles."""

import io
import json
from pathlib import Path

import numpy as np
import yaml
from PIL import Image
from pmtiles.reader import MmapSource, Reader

from deerscout.candidates import build_candidates, property_summary
from deerscout.grid import Grid
from deerscout.process import PIPELINE_VERSION, compute, q8
from deerscout.tiles import merge

CFG = yaml.safe_load((Path(__file__).parents[1] / "config.yaml").read_text())


def fixture(grid: Grid):
    h, w = grid.shape
    yy, xx = np.mgrid[0:h, 0:w]
    dem = (300 + 0.08 * yy + 5 * np.sin(xx / 40)).astype(np.float32)
    nlcd = np.full((h, w), 82, np.uint8)  # crops everywhere...
    nlcd[:, 60:200] = 41  # ...with a hardwood block
    nlcd[100:160, 120:180] = 90  # woody wetland inside it
    nlcd[:, 250:256] = 11  # water strip
    cdl = np.where(nlcd == 82, 1, 0).astype(np.uint8)  # corn
    nwi = np.zeros((h, w), np.uint8)
    nwi[110:150, 130:170] = 2  # scrub-shrub
    roads = np.zeros((h, w), bool)
    roads[5, :] = True
    prop = np.zeros((h, w), bool)
    prop[30:230, 50:210] = True
    buf = np.ones((h, w), bool)
    z = np.zeros((h, w), bool)
    return {"dem": dem, "nlcd": nlcd, "cdl": cdl, "nwi": nwi, "roads": roads, "busy": z, "quiet": z, "prop": prop, "buf": buf}


def test_pipeline_smoke(tmp_path: Path):
    grid = Grid(13, 1959, 2960, 1, 1)
    res = compute(fixture(grid), grid, CFG, [(6, 128)])
    for k, v in res["factors"].items():
        assert v.shape == grid.shape and 0 <= v.min() and v.max() <= 1, k
    assert res["factors"]["corridor"].max() > 0
    cands = build_candidates(res, CFG)
    kinds = {c["kind"] for c in cands}
    assert {"stand", "bedding"} <= kinds
    stand = next(c for c in cands if c["kind"] == "stand")
    assert stand["reasons"] and "goodWinds" in stand["wind"]
    summ = property_summary(res, CFG, {})
    assert set(summ["scores"]) == {"early", "rut", "late"}
    assert summ["walkMin"] is not None

    work = tmp_path / "props"
    work.mkdir()
    np.savez_compressed(
        work / "p1.npz",
        grid=np.array([13, 1959, 2960, 1, 1]),
        prop=res["prop"],
        buf=res["buf"],
        **{f"f_{k}": q8(v) for k, v in res["factors"].items()},
        thermal=q8(res["thermal"]),
        access=np.clip(np.nan_to_num(res["access"], posinf=255), 0, 255).astype(np.uint8),
        **{f"s_{k}": q8(v) for k, v in res["seasons"].items()},
    )
    (work / "p1.json").write_text(json.dumps({"pipeline_version": PIPELINE_VERSION, "id": "p1", "name": "Fixture", "summary": summ, "candidates": cands}))
    out = tmp_path / "out"
    meta = merge(work, out, CFG, {"p1": {"name": "Fixture"}})
    assert meta["counts"]["properties"] == 1
    for name in ("heat-early", "heat-rut", "heat-late", "corridors", "factors"):
        assert (out / f"{name}.pmtiles").stat().st_size > 0
    r = Reader(MmapSource(open(out / "factors.pmtiles", "rb")))
    img = np.array(Image.open(io.BytesIO(r.get(13, 1959, 2960))))
    assert img.shape == (768, 256, 3)
    assert img[512 + 100, 100, 2] == 255  # mask block: inside property
    hr = Reader(MmapSource(open(out / "heat-rut.pmtiles", "rb")))
    assert hr.header()["min_zoom"] == 9 and hr.get(9, 1959 >> 4, 2960 >> 4)
    rk = json.loads((out / "rankings.json").read_text())
    assert rk["properties"][0]["id"] == "p1"
