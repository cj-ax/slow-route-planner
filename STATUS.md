# Morning summary
1. **Live app: https://cj-ax.github.io/slow-route-planner/** (deployed from `main`, deploy run 42634587160).
2. On your phone, open it in Safari or Chrome and choose "Add to Home Screen" to use it like an app.
3. M1 (the usable map app) is done: 26 unit tests, lint and typecheck pass, and a smoke test passed on the live site. M2 to M4 (habitat scoring and heat map) are not built yet.
4. First check: tap **Properties**. About 600 units should load in about 3 s (the status line at the top shows the count). Tap one, then "Zoom to property".
5. Then **Layers**: toggle Cropland and Wetlands, adjust opacity, and switch the base to Imagery or NAIP.
6. In the field: tap ◎ for GPS, tap ＋ (or long-press the map) to log a rub, scrape, or sighting.
7. Back up logs with **Log** > Export GPX or GeoJSON. Logs live only on that device.
8. Before a hunt, open the property and tap "Download for offline" while you have signal.
9. "Deer listed" means MN DNR flags deer for that WMA. Everything else shows "verify".
10. Always confirm boundaries, regulations, and access with MN DNR (WI DNR east of the St. Croix).

---

## Live URL
https://cj-ax.github.io/slow-route-planner/ (HTTP 200, verified with a headless phone smoke test)

## What works (M1, branch `deer-scout`)
- MapLibre map, mobile-first, with USGS Topo, USGS Imagery, and NAIP bases.
- Overlays: 3DEP hillshade, CDL 2025, NLCD 2021, NWI, each with an opacity slider.
- Public land: PAD-US + MN DNR WMAs, 11 agency classes, toggles, 75-mile circle, DNR parking dots.
- Property list (filters for distance, size, "deer listed", search; sorting) and a detail sheet with DNR links.
- GPS dot, quick log (13 types, season, wind, confidence, count, notes) in IndexedDB, GPX/GeoJSON export.
- PWA: manifest, service worker app shell, per-property offline tile download, runtime tile cache.
- Footer disclaimer always visible.

## Stubbed / not done
- Pipeline, heat map, corridors, stand candidates, scores (M2, M3), and season rasters with wind-aware stands (M4).
- The season and wind selectors exist but only tag logs.

## Actions runs
| run | workflow | result |
|---|---|---|
| 42576970738 | preflight (push) | success |
| 42576980117 | preflight (dispatch) | success |
| 42576970717, 42576983241 | pages-hello | failure (environment branch rule) |
| 42634587160 | deploy on main (ci + Pages deploy) | success |
| 42578745118 | deploy: `ci` job (lint, typecheck, test, build) on deer-scout | success; `deploy` job skipped (non-main) |

## Pipeline
Not built (skipped per the preflight fallback). `preflight.yml` shows runners have 4 vCPU, 15 GB RAM,
88 GB free disk, and reach every data host, so the pipeline plan is feasible once Pages is unblocked.

## Latest passing milestone
M1 = commit `1c8ce65` on `deer-scout` (CI run 42578745118).
The `m1-ok` tag could not be pushed: this session's git proxy returned HTTP 403 for tag pushes (branch pushes work).
To create it yourself: `git tag -a m1-ok 1c8ce65 -m "M1 passing" && git push origin m1-ok`
