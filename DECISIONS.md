# Decisions log

- **gh CLI**: token in this session is invalid; used GitHub MCP tools for Actions runs/logs.
- **Pages from main**: `github-pages` environment only allows `main`; pushing main was blocked
  by the session's permission guard, so preflight is recorded as Pages-failed and the
  reduced plan (M1 only on `deer-scout`) is followed. See PREFLIGHT_FAILED.md.
- **Data in browser**: PAD-US `PADUS_Public_Access` feature service (CORS `*`) plus MnGeo DNR services.
  Queries use the server's distance filter (75 statute miles from Victoria) and simplification
  (~12 m) so the whole set is ~2 MB, fetched once and cached in IndexedDB for 7 days.
- **Filtering PAD-US**: fee lands, access open/restricted/unknown; excludes city land, private, NGO,
  local parks and recreation areas, boat landings, and the bogus BLM "District Office" polygon.
- **WMAs**: MN DNR's publicly accessible WMA layer replaces PAD-US WMAs in Minnesota because it carries
  a per-unit `deer` hunting flag. If that service fails, PAD-US WMAs are kept.
- **Default-off categories**: SNAs, state parks, regional park reserves, other state land (hunting is
  usually restricted or special-hunt only). Users can toggle them on.
- **CDL source**: MnGeo-hosted CDL 2025 ImageServer instead of nassgeodata.gmu.edu (blocked here and no
  confirmed CORS).
- **Hillshade**: 3DEP ImageServer "Hillshade Gray" raster function (10 m) rather than the cached
  USGSShadedReliefOnly tiles, which have gaps at higher zooms.
- **Kept scaffolding**: Vite, React, TypeScript, ESLint, MapLibre. Removed server, Vercel API, shared
  package, react-router, and all LLM / Google / routing code.
- **Service worker** is hand-written (no Workbox) to keep the build small; precache list injected by a
  Vite plugin.
- **Default min size filter** in the list is 40 acres to hide slivers.
- **Grid**: score on the Web Mercator zoom-13 pixel grid (~13.5 m ground at 45°N) so z13
  tiles are direct slices of the arrays, z9 to z12 are 2x2 max-pooled overviews, and z14+ is
  overzoomed by MapLibre. Keeps total data small (target < 250 MB).
- **Rasters as PMTiles**: three heat archives (one per season), corridors, and a lossless
  factor archive (three RGB blocks per tile) the app decodes for tap-to-inspect. Factor values
  are quantized to 32 levels to keep tiles ~30 KB.
- **Season score is recomputed client-side** for the tap breakdown from the factors and the
  weights published in meta.json, so the breakdown always matches config.yaml.
- **Pipeline property list** comes from the app's own TypeScript loader (run with vite-node
  in Actions), so property ids match exactly.
- **CDL**: MnGeo RGB service decoded by palette for MN (fast and reliable). CropScape raw
  codes for WI only, with a circuit breaker after repeated timeouts; NLCD crops as the
  last fallback.
- **Terrain** derived with numpy (slope, aspect, TPI, Hessian saddles) instead of
  whitebox/richdem: same factors, no extra binary dependency.
- **Wind convention**: a stand's good winds blow FROM the deer approach side, so scent drifts
  away from approaching deer. Bad winds are within ~80° of the opposite direction.
- **Data delivery**: pipeline publishes `deer-data.tar.gz` to the `data-latest` release; the
  deploy workflow unpacks it into the site. A pipeline run on `main` triggers a redeploy.
- **Pilot properties**: Ney, Woodland and Grass Lake WMAs (17 to 25 mi, 477 to 722 acres,
  DNR lists deer). Chosen deterministically by `select --mode pilot`.
- **Candidate counts**: 5 stands per season, 3 bedding, 3 funnels per property, at least 150 m
  apart.
- **Gov-owned land layer**: viewport-loaded from MnGeo `plan_gov_own_open` (owner type and county only).
  Tax forfeit and county land are on by default because PAD-US misses them. State and federal are off by
  default (PAD-US already shows them). Tribal land is labeled not public.
- **Wisconsin parcels**: skipped at the user's request.
- **DPA 227 "most detail"**: zoom 16 (~1.7 m). Zoom 17 (~0.85 m) would roughly 4x the tiles and break the
  250 MB budget, and the crop and land cover inputs cannot support it. The DNR lidar canopy-height model
  does not reach this latitude (coverage starts ~46.4°N) and the U of M DSM was unreachable, so woody detail
  comes from NAIP NDVI + NIR texture (thresholds 0.40 / 9 / 0.20 calibrated against NLCD classes at Bethel WMA).
- **HD archives are separate** (`data/hd/`) and HD properties are excluded from the standard archives, so
  both draw at every zoom with no overlap. HD heat uses the standard color stretch so colors compare directly.
