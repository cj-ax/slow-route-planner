# Known limits

## Model
- **It is a habitat model, not deer data.** Scores combine free land-cover, crop, wetland,
  terrain and road layers with hand-set weights (`pipeline/config.yaml`). They have not
  been calibrated against real sightings. The log schema is designed so your logs can tune
  the weights later.
- **Cell size ~13.5 m** (Web Mercator z13 at 45°N). Fine features such as a single oak, a
  fence-line gap or a creek crossing are below resolution.
- **Land cover dates:** NLCD 2021, CDL 2025 (crop rotation changes every year), NWI of
  varying vintage. Recent timber cuts or new food plots are not captured.
- **Food:** CDL crops near the property are treated as available food whether or not they are
  harvested. Oak mast uses NLCD deciduous forest as a weak proxy.
- **Corridors:** least-cost paths between modeled bedding and food inside each property's
  500 m buffer. Movement from beyond the buffer is not modeled.
- **Wind:** one approach direction per stand from nearby cover and corridors. No thermals,
  terrain eddies or time of day. Treat it as a starting point.
- **Pressure:** distance to OSM roads, trails and parking only. Real hunter density is unknown.
- **Wisconsin:** CDL comes from CropScape, which often times out; then NLCD cultivated crops
  and hay stand in. Wisconsin regulations and licenses apply there.
- **CDL for Minnesota** is decoded from MnGeo's color-rendered service by matching the
  standard CDL palette. Rare crop classes may be missed.
- **1 m lidar** for the top properties was not done. 3DEP at ~10 m resampled to the grid is
  used everywhere.
- Very spread-out property groups (over 24 z13 tiles on a side, about 80 km) are skipped.

## App and data
- **Hunting status** is `listed` only for MN WMAs where the DNR layer sets the `deer` flag.
  Everything else is `unknown`.
- **County tax-forfeit land** has no statewide public service. Only what PAD-US carries as
  County Land is shown.
- **State forests** come from PAD-US fee parcels, not the DNR statutory boundaries, which
  include private inholdings.
- **MN vs WI** is inferred from an approximate river border line.
- **Grouping by name:** PAD-US tracts that share a name are merged into one property, even
  when miles apart.
- **Distances** to Victoria are straight-line. Walk times are slope-aware (Tobler) from DNR
  or OSM parking, or from the nearest road when no lot is known.
- **Offline:** "Download for offline" caches base-map and overlay tiles. The heat map,
  corridors and tap breakdown come from PMTiles range requests and are **not** cached
  offline yet. Stand and candidate points work offline once loaded in that session.
- Logs live only on the device (IndexedDB). Export GPX or GeoJSON to back them up.
- The `m1-ok`-style tags could not be pushed from the Claude session (the git proxy refused
  tag pushes). Milestone commits are listed in STATUS.md.
