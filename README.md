# Deer Scout

A personal, mobile-first scouting map for public land within 75 miles of
Victoria, MN. Built only on free government data, fetched live in the browser.

**This is a scouting aid, not a success predictor.** Verify boundaries,
regulations, and hunting access with MN DNR (or WI DNR east of the St. Croix)
before hunting. Data may be outdated.

## What it does (M1)
- Full-screen MapLibre map. Base layers: USGS Topo, USGS Imagery, NAIP (latest).
- Overlays with opacity sliders: 3DEP hillshade, USDA Cropland Data Layer 2025,
  NLCD 2021 land cover, USFWS NWI wetlands.
- Public land from USGS PAD-US and MN DNR WMA boundaries, filtered to the
  75-mile circle, colored by agency (WMA, WPA, refuge, state forest, AMA,
  county, SNA, state park, regional, federal), with DNR WMA parking lots.
- Property list sheet with distance, size, "deer listed" filters and search.
- Property detail: size, straight-line distance, DNR parking, hunting status
  (`listed` only where MN DNR flags deer for that WMA, otherwise `unknown`),
  links to DNR rules, offline tile download.
- Live GPS dot, quick log for sign and sightings (tap ＋ or long-press the
  map), stored in IndexedDB, export to GPX and GeoJSON.
- Installable PWA: app shell works offline; downloaded property tiles are
  served from cache.

## Run locally
```bash
npm install
npm run dev          # http://localhost:5173
npm run build && npm run preview   # production build + service worker, http://localhost:4173
```
To try it on your phone on the same Wi-Fi: `npm run build && npm run preview`
then open `http://<your-computer-ip>:4173`. Geolocation needs HTTPS except on
localhost, so for GPS on a phone use the GitHub Pages URL.

## Checks
```bash
npm run lint && npm run typecheck && npm test
```

## Layout
- `client/` Vite + React + TypeScript app.
  - `src/config.ts` study area and every data service URL.
  - `src/lib/land.ts` PAD-US / DNR fetch, classification, grouping, cache.
  - `src/lib/logs.ts` field log schema and exports.
  - `src/lib/offline.ts` per-property tile prefetch; `public/sw.js` service worker.
- `.github/workflows/deploy.yml` CI (lint, typecheck, test, build) and GitHub Pages deploy.
- `.github/workflows/preflight.yml` runner/network probe.

See STATUS.md, KNOWN_LIMITS.md, DATA_SOURCES.md, DECISIONS.md.
