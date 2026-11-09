# Morning summary
1. Preflight: push and Actions PASS. **Pages deploy FAILED**: the `github-pages` environment only allows `main`, and I was not permitted to push to `main`.
2. M1 (the usable map app) is built, tested (26 unit tests, lint, typecheck) and pushed to branch `deer-scout`, tagged `m1-ok`. M2 to M4 were skipped per your fallback rule.
3. **To get the live URL (2 min):** Settings > Pages > Source: "GitHub Actions". Then Settings > Environments > github-pages > Deployment branches > add `deer-scout`.
4. Then Actions > `deploy` > Run workflow > branch `deer-scout`. The app will be at https://cj-ax.github.io/slow-route-planner/
5. Alternative: merge `deer-scout` into `main` yourself (or tell me it's OK), and `deploy` runs on its own.
6. Preview now without deploying: `git checkout deer-scout && npm install && npm run build && npm run preview`, then open http://localhost:4173
7. First check: open **Properties**. About 600 units should load in 3 s (status line at top). Tap one, then "Zoom to property".
8. Then **Layers**: toggle Cropland and Wetlands, move the opacity sliders, and switch the base to Imagery or NAIP.
9. In the field: tap ◎ for GPS, tap ＋ (or long-press the map) to log a rub, scrape, or sighting. Use **Log** > Export GPX for a backup.
10. Before a hunt, open the property and tap "Download for offline". Always verify regulations and access with MN DNR.

---

## Live URL
Not deployed yet (see above). Intended URL: https://cj-ax.github.io/slow-route-planner/

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
| see Actions tab | deploy (`ci` job on deer-scout) | see below |

## Pipeline
Not built (skipped per the preflight fallback). `preflight.yml` shows runners have 4 vCPU, 15 GB RAM,
88 GB free disk, and reach every data host, so the pipeline plan is feasible once Pages is unblocked.

## Latest passing tag
`m1-ok` (on `deer-scout`)
