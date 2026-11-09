import numpy as np
import pytest

from deerscout import factors as F
from deerscout.candidates import ang_diff, approach_bearing, dir8, wind_advice
from deerscout.grid import Grid, grid_for_bbox, res_m

FOOD_CFG = {"in_field": 0.35, "ramp_m": 100, "best_max_m": 400, "zero_at_m": 1500, "oak_bonus": 0.25}


def test_slope_aspect_south_facing():
    # Elevation drops toward the south (higher row index) -> faces south (180°).
    dem = np.tile(np.arange(50, 0, -1, dtype=np.float32)[:, None], (1, 50))
    slope, aspect = F.slope_aspect(dem, 10.0)
    assert slope[25, 25] == pytest.approx(10.0, rel=1e-3)
    assert aspect[25, 25] == pytest.approx(180.0, abs=1)


def test_slope_aspect_east_facing():
    dem = np.tile(np.arange(50, 0, -1, dtype=np.float32)[None, :], (50, 1))
    _, aspect = F.slope_aspect(dem, 10.0)
    assert aspect[25, 25] == pytest.approx(90.0, abs=1)


def test_food_peaks_between_100_and_400m():
    crop = np.zeros((1, 200), bool)
    crop[0, :10] = True
    f, d = F.food_factor(crop, np.zeros((1, 200), np.float32), 10.0, FOOD_CFG)
    assert f[0, 5] == pytest.approx(0.35)  # in the field
    assert f[0, 10 + 25] == pytest.approx(1.0)  # ~250 m out
    assert 0.6 <= f[0, 12] < 1.0  # ramp
    assert f[0, 9 + 150] == 0  # 1500 m


def test_cover_prefers_shrub_wetland():
    nlcd = np.array([[52, 82, 41, 11]], np.uint8)
    nwi = np.array([[0, 0, 0, 0]], np.uint8)
    cfg = {"nlcd": {41: 0.6, 52: 0.9, 82: 0.05}, "nwi_scrub_shrub": 0.95, "nwi_emergent": 0.75, "nwi_forested": 0.85, "smooth_px": 0}
    c = F.cover_factor(nlcd, nwi, cfg)
    assert c[0, 0] > c[0, 2] > c[0, 1] > c[0, 3] == 0


def test_pressure_rewards_distance_and_penalizes_trails():
    cfg = {"full_at_m": 400, "exponent": 0.8, "busy_trail_m": 150, "busy_trail_factor": 0.6, "quiet_trail_m": 75, "quiet_trail_factor": 0.85}
    far = np.array([[1000.0]])
    near = np.array([[50.0]])
    big = np.array([[5000.0]])
    assert F.pressure_factor(far, big, big, big, cfg)[0, 0] == pytest.approx(1)
    assert F.pressure_factor(near, big, big, big, cfg)[0, 0] < 0.3
    assert F.pressure_factor(far, big, np.array([[20.0]]), big, cfg)[0, 0] == pytest.approx(0.6)


def test_edge_is_highest_on_boundary():
    woody = np.zeros((20, 20), bool)
    woody[:, :10] = True
    e = F.edge_factor(woody, ~woody, 10.0, {"decay_m": 40})
    assert e[10, 9] == pytest.approx(1)
    assert e[10, 0] < 0.2


def test_corridor_follows_cheap_cover():
    cost = np.full((30, 30), 10.0)
    cost[:, 15] = 1.0  # a strip of cover
    corr = F.corridor_factor(cost, [(0, 15)], [(29, 15)], 1, 0)
    assert corr[15, 15] == 1
    assert corr[15, 2] == 0


def test_pick_peaks_spacing():
    s = np.zeros((50, 50))
    s[10, 10] = 1
    s[11, 11] = 0.99
    s[40, 40] = 0.5
    pts = F.pick_peaks(s, np.ones_like(s, bool), 3, 5, 0.1)
    assert pts[0] == (10, 10)
    assert (11, 11) not in pts
    assert (40, 40) in pts


def test_season_weights_shift_score():
    one, zero = np.ones((1, 1), np.float32), np.zeros((1, 1), np.float32)
    f = {k: zero for k in F.FACTORS}
    f["corridor"] = one
    rut = {"weights": {"food": 0.1, "cover": 0.15, "edge": 0.2, "corridor": 0.3, "pressure": 0.15, "terrain": 0.1}}
    early = {"weights": {"food": 0.35, "cover": 0.2, "edge": 0.15, "corridor": 0.15, "pressure": 0.1, "terrain": 0.05}}
    assert F.season_score(f, rut, zero)[0, 0] > F.season_score(f, early, zero)[0, 0]


def test_tobler_flat_is_about_5kmh():
    m = F.tobler_minutes_cost(np.zeros((1, 1)), np.zeros((1, 1), bool), 100.0, 30)
    assert m[0, 0] == pytest.approx(100 / 5036.7 * 60, rel=0.02)


def test_wind_advice():
    w = wind_advice(0.0)  # deer to the north
    assert "N" in w["goodWinds"] and "S" in w["badWinds"]
    assert wind_advice(None)["goodWinds"] == []
    assert dir8(359) == "N" and dir8(100) == "E"
    assert ang_diff(350, 10) == 20


def test_approach_bearing_points_at_weight():
    w = np.zeros((41, 41), np.float32)
    w[:10, 18:23] = 1  # north
    b = approach_bearing(w, 20, 20, 20)
    assert b is not None and (b < 20 or b > 340)


def test_grid_alignment():
    g = grid_for_bbox((-93.9, 44.54, -93.87, 44.56), 500, 13)
    assert isinstance(g, Grid)
    minx, miny, maxx, maxy = g.bounds
    span = 256 * res_m(13)
    assert ((minx + 20037508.342789244) / span) == pytest.approx(round((minx + 20037508.342789244) / span))
    assert 12 < g.ground_res < 15
    assert g.shape == (g.ny * 256, g.nx * 256)


def test_rgb_to_cdl_decodes_crop_colors():
    from deerscout.fetch import rgb_to_cdl

    rgb = np.zeros((3, 1, 4), np.uint8)
    rgb[:, 0, 0] = (255, 210, 0)  # corn, slightly off-palette
    rgb[:, 0, 1] = (36, 110, 0)  # soybeans
    rgb[:, 0, 2] = (154, 154, 154)  # developed -> not a crop
    rgb[:, 0, 3] = (255, 163, 224)  # alfalfa
    assert list(rgb_to_cdl(rgb)[0]) == [1, 5, 0, 36]


def test_nwi_codes():
    from deerscout.fetch import nwi_code

    assert nwi_code("PSS1A") == 2 and nwi_code("PEM1C") == 1 and nwi_code("PFO1A") == 3
    assert nwi_code("L1UBH") == 4 and nwi_code("") == 0


def test_osm_classify():
    from deerscout.osm import classify

    assert classify({"highway": "residential"}) == "road"
    assert classify({"highway": "service", "service": "driveway"}) is None
    assert classify({"highway": "path", "name": "Luce Line"}) == "busy"
    assert classify({"highway": "track"}) == "quiet"
    assert classify({"amenity": "parking"}) == "parking"


def test_large_grids_are_searched_coarse(monkeypatch):
    monkeypatch.setattr(F, "MAX_SEARCH_CELLS", 100)
    cost = np.full((40, 40), 10.0)
    cost[:, 20] = 1.0
    corr = F.corridor_factor(cost, [(0, 20)], [(39, 20)], 1, 0)
    assert corr.shape == cost.shape and corr[20, 20] > 0.5
    mins = F.access_minutes(np.ones((40, 40)), [(0, 0)], 120)
    assert mins.shape == (40, 40) and mins[39, 39] > mins[5, 5] > 0
