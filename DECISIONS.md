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
