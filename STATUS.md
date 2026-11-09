# Morning summary
1. **Live app: https://cj-ax.github.io/slow-route-planner/** (M1 to M4 deployed from `main`).
2. On your phone: open it, then "Add to Home Screen". Heat maps and stands load as you zoom in.
3. **Properties** tab: 519 public units scored, sorted by habitat score for the selected season. Filter by distance, size and score; each row shows walk time and top reasons.
4. Pick a **Season** (Early archery, Rut, Late) at the top. The heat map, stand candidates and scores switch with it.
5. Set **Wind from**. Stand dots turn green (good), amber (marginal) or red (bad). Tap a stand for reasons, best winds and entry advice.
6. Tap anywhere on scored land for a factor breakdown (food, cover, edge, corridor, pressure, terrain) and walk minutes.
7. Layers: heat opacity, travel corridors, bedding and funnel candidates, CDL / NLCD / NWI overlays, and MN parcel lines (zoom 14+).
8. In the field: tap ◎ for GPS, tap ＋ or long-press to log sign. Export logs (GPX or GeoJSON) from the Log tab.
9. First check: a WMA you know well. Do the stands and corridors match what you have seen? Weights live in `pipeline/config.yaml`.
10. It is a scouting aid, not a success predictor. Verify boundaries, regulations and access with MN DNR (WI DNR east of the St. Croix).

---

## Live URL
https://cj-ax.github.io/slow-route-planner/ (HTTP 200, verified with a headless phone smoke test)

## What works
- MapLibre map, mobile-first, with USGS Topo, USGS Imagery, and NAIP bases.
- Overlays: 3DEP hillshade, CDL 2025, NLCD 2021, NWI, each with an opacity slider.
- Public land: PAD-US + MN DNR WMAs, 11 agency classes, toggles, 75-mile circle, DNR parking dots.
- Property list (filters for distance, size, "deer listed", search; sorting) and a detail sheet with DNR links.
- GPS dot, quick log (13 types, season, wind, confidence, count, notes) in IndexedDB, GPX/GeoJSON export.
- PWA: manifest, service worker app shell, per-property offline tile download, runtime tile cache.
- Footer disclaimer always visible.

- **M2/M3 pipeline** (`/pipeline`, Actions `pipeline` workflow): 519 properties scored at ~13.5 m.
  Season heat maps, corridors, factor tiles (PMTiles), rankings and 9,831 candidates. Published data is 60 MB.
- **M3 app**: ranked list (score, size, walk time, distance, reasons, score filter), tap-anywhere breakdown.
- **M4**: season toggle, wind-aware stands with warnings, 35 app tests plus 18 pipeline tests (including an
  end-to-end fixture smoke test), lint and type checks in CI, docs.
- **Parcel lines**: MN open county parcels, outlines only, viewport-loaded at zoom 14+.

## Stubbed / not done
- 1 m lidar for the top properties (3DEP ~10 m is used everywhere).
- 16 very spread-out property groups (over 24 z13 tiles across, e.g. statewide habitat-area groupings) are not scored.
- Heat, corridor and factor tiles are not cached for offline use (base tiles are).
- Wisconsin parcels and the MnGeo government-owned-lands layer are not added.
- See KNOWN_LIMITS.md.

## Actions runs
| run | workflow | result |
|---|---|---|
| 42576970738 | preflight (push) | success |
| 42576980117 | preflight (dispatch) | success |
| 42576970717, 42576983241 | pages-hello | failure (environment branch rule) |
| 42634587160 | deploy on main (ci + Pages deploy) | success |
| 42641504190 | pipeline pilot (3 properties) | success |
| 42658790520 | pipeline all, 8 shards, 519 properties, 60 MB | success |
| 42578745118 | deploy: `ci` job (lint, typecheck, test, build) on deer-scout | success; `deploy` job skipped (non-main) |

## Pipeline (run manually)
Actions > `pipeline` > Run workflow on `main`, mode `all`, shards `8`. It takes about 6 min when cached and about 45 min from scratch
(the USGS elevation service slows under parallel load). It publishes the `data-latest` release and redeploys the site.
Use mode `pilot` for a 3-property test, or `ids:<id>,<id>` for specific units. Details in pipeline/README.md.

## Latest passing milestone
M1 = commit `1c8ce65` on `deer-scout` (CI run 42578745118).
The `m1-ok` tag could not be pushed: this session's git proxy returned HTTP 403 for tag pushes (branch pushes work).
To create it yourself: `git tag -a m1-ok 1c8ce65 -m "M1 passing" && git push origin m1-ok`
