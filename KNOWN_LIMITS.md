# Known limits

- **Not deployed to GitHub Pages yet.** The `github-pages` environment only accepts `main`, and this
  session was not permitted to push to `main`. See PREFLIGHT_FAILED.md for the 2-minute fix.
- **No habitat scoring or heat map yet.** M2 to M4 (Python pipeline, rankings, season rasters,
  wind-aware stands) were skipped under the preflight fallback plan. The season and wind selectors
  only tag new logs for now.
- **Hunting status** is `listed` only for MN WMAs where the DNR layer sets the `deer` flag. Everything
  else is `unknown`, including WPAs and refuges, which have unit-specific rules.
- **County tax-forfeit land** has no statewide public service. Only what PAD-US carries as County Land
  (conservation / other designations) is shown. County parks are excluded.
- **State forests** come from PAD-US fee parcels. The DNR statutory forest boundaries include private
  inholdings, so they are not used.
- **MN vs WI** is inferred from an approximate river border line. It is a label, not a legal boundary.
- **Grouping by name:** PAD-US tracts that share a name (for example "Scott County Waterfowl Production
  Area") are merged into one property, even if they are miles apart. The bbox and offline download
  then cover all tracts.
- **Parking** is DNR WMA parking only. Other properties show "none in DNR data".
- **Distances** are straight-line to the nearest boundary vertex, not drive or walk distance.
- **Offline:** tiles for a property are cached at zoom 11 to 16 (max 4000 tiles). Public land data is
  cached in IndexedDB after the first load. Labels use a self-hosted Latin glyph range only.
- **NLCD** is the 2021 release. Annual NLCD exists but was not wired in.
- **Logs** live only on the device (IndexedDB). Export GPX/GeoJSON to back them up.
