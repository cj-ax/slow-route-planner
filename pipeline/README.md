# Deer Scout pipeline

Scores public land for likely deer activity from free government data and
publishes map tiles the app reads. Everything heavy runs in GitHub Actions.

## How it works
1. **prep** job: exports the app's exact property list (`export_properties.ts`, same ids
   and filters as the app), downloads Geofabrik MN + WI extracts (cached weekly), filters
   roads, trails and parking with osmium into `osm.parquet`.
2. **score** matrix: each shard processes its share of properties. For each property it
   builds a zoom-13 Web Mercator grid (~13.5 m cells) covering the property plus a 500 m
   buffer (never the full circle), fetches 3DEP DEM, CDL, NLCD, NWI for that grid, computes
   factors and candidates, and writes `<id>.npz` + `<id>.json`. Work and downloads are
   cached per shard, so a rerun resumes where it stopped. Each job has a 270-minute
   budget, under the 5-hour limit.
3. **merge** job: cuts the grids into tiles, builds z9 to z12 overviews, writes PMTiles plus
   `rankings.json`, `candidates.geojson`, `meta.json`, publishes them as the `data-latest`
   release asset, then (on `main`) triggers the `deploy` workflow, which unpacks it into
   the site under `data/`.

## Model (all weights in `config.yaml`)
Each factor is normalized 0..1 on the grid:
- **food**: distance to preferred CDL crops (corn, soybeans, alfalfa/hay, small grains), best
  100 to 400 m from the field edge, plus NLCD deciduous forest as a minor mast proxy.
- **cover**: NLCD shrub, woody wetland, forest, emergent wetland, boosted by NWI scrub-shrub,
  emergent and forested wetland.
- **edge**: woody cover meeting crops, grass, pasture or wetland, decaying over ~40 m.
- **corridor**: least-cost paths (scikit-image MCP) from modeled bedding to food edges,
  accumulated and smoothed, boosted at narrow strips of cover and terrain saddles.
- **pressure**: distance from roads and parking (full credit past ~400 m), penalized near
  named or foot/bike trails (OSM).
- **terrain**: 5 to 25% slopes, benches, ridge points and saddles, leeward (E to S) aspects.
- **thermal** (late season only): south-facing slopes and conifers mixed into cover.
- **access** (kept separate, never blended into activity): Tobler walking minutes from the
  nearest DNR/OSM parking lot, or from any road if there is no lot.

Season score = weighted mean of the six factors with the season's weights.

Stand candidates are the best spots for the season score, corridor and edge, next to
woody cover and at least 150 m apart. Wind advice comes from the weighted direction of
bedding cover and corridors within 300 m. Good sit winds blow from that side. Entry
direction is toward the nearest parking.

## Run it
- Actions > `pipeline` > Run workflow. `mode`: `pilot` (3 properties), `all`, or
  `ids:<id>,<id>`. `shards`: parallel jobs (12 is good for `all`).
- Run it on `main` to publish to the live site. On another branch it publishes the release
  asset but does not redeploy.
- Locally (from the repo root):
  ```bash
  pip install -r pipeline/requirements.txt
  npx vite-node pipeline/export_properties.ts -- pipeline/work/properties.geojson
  PYTHONPATH=pipeline python -m deerscout.cli select --mode pilot
  PYTHONPATH=pipeline python -m deerscout.cli process --mode pilot
  PYTHONPATH=pipeline python -m deerscout.cli merge --out pipeline/out
  ```
  Without OSM, pressure uses DNR parking only. Without CropScape, CDL is decoded from the
  MnGeo RGB service.

## Tests
`cd pipeline && ruff check . && python -m pytest -q`. This covers the factor functions and an
end-to-end smoke test on a synthetic fixture through to PMTiles.
