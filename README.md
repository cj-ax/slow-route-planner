# Slow Route Planner

A **local-first, personal** route planner + live ride dashboard. Describe the ride you want in
plain language, get a scenic / low-stress route plan with editable waypoints on a dark MapLibre map,
then open a full-screen **Ride Mode** that tracks your live GPS position against the planned route.

Built for one rider (you). No accounts, no auth, no production security — simple, readable, hackable.

> **It runs with zero API keys.** With nothing configured it uses realistic mock data (a Lake
> Minnetonka loop) and a keyless dark map, and shows a non-blocking "mock mode" banner. Add keys when
> you want live route generation and place search.

---

## Features

- **Prompt → plan.** Natural-language description → a `RoutePlan` with 5–10 purpose-tagged waypoints
  (scenic, lake view, residential detour, route shaping, destination), avoid-roads, route notes, and
  manual-check reminders.
- **Editable.** Rename / re-query / reorder / lock / remove waypoints; search endpoint options
  (coffee, beer, food, ice cream, view) and set the destination.
- **Map-first.** MapLibre map with color-coded waypoint markers, a legend, and a straight-segment
  polyline. Click a waypoint to fly to it.
- **Save & reopen.** Routes persist to a local JSON file (and Vercel Blob in production), searchable
  on the Saved page, with rating + personal notes.
- **Ride Mode.** Full-screen cockpit: live location marker with heading, current speed, GPS quality,
  next waypoint + distance, off-route warning, follow mode, recenter, skip waypoint, screen wake
  lock, and a collapsible debug panel.
- **Open in Google Maps** as a turn-by-turn fallback.

---

## Quick start (no keys needed)

```bash
npm install
cp .env.example .env     # optional — defaults already work
npm run dev
```

- Client: <http://localhost:5173>
- API: <http://localhost:3001/api/health>

You'll see a "Mock mode" banner. Type a ride description (or use the prefilled example) → **Generate
route** → edit → **Save route** → **Open Ride Mode**.

> Ride Mode needs **location permission** and works best on **HTTPS** (or `localhost`). For real GPS
> testing on your phone, deploy to Vercel (below) and open the URL there.

---

## Project structure

```
shared/   @srp/shared — domain types + pure utils (geo, format, googleMaps, waypoints)
server/   @srp/server — Express API (mock + real placeholders) and storage adapters
client/   @srp/client — React + Vite app (MapLibre, Ride Mode, pages, hooks)
api/      Vercel serverless entry — re-exports the Express app
```

npm **workspaces** monorepo: one `npm install` at the root installs everything; `npm run dev` runs
the server and client together.

---

## Environment variables

See [`.env.example`](.env.example) for the full annotated list. Highlights:

| Variable | Side | Purpose | Default |
| --- | --- | --- | --- |
| `PORT` | server | API port for local dev | `3001` |
| `LLM_API_KEY`, `LLM_MODEL` | server | Real route generation. Blank → mock plans. | blank |
| `GOOGLE_PLACES_API_KEY` | server | Real place search. Blank → mock places. | blank |
| `ORS_API_KEY` | server | OpenRouteService key for **road-following routes**. Blank → straight lines. Independent of `USE_MOCKS`. | blank |
| `USE_MOCKS` | server | Force mock mode even with keys present | `true` |
| `BLOB_READ_WRITE_TOKEN` | server | Auto-provided by Vercel Blob. Switches storage to Blob. | unset (uses JSON file) |
| `VITE_API_BASE_URL` | client | API origin. **Leave blank** — dev proxies `/api` to `:3001`, Vercel serves it same-origin. | blank |
| `VITE_MAP_STYLE_URL` | client | MapLibre style. Blank → keyless dark raster fallback. | blank |

**Secrets live only in server-side env vars.** `VITE_*` values are bundled into the browser, so the
only client-exposed value is the map style URL (a domain-restricted MapTiler key is normal for
tiles). The LLM, Places, and routing keys never reach the client. Settings shows configuration
**status only**, never values.

### Road-following routes (recommended — fixes lines across water)

Without a routing key the map draws **straight lines between waypoints**, which cut across lakes.
Set an [OpenRouteService](https://openrouteservice.org/dev) key (free) to draw real road geometry
instead — it's called server-side, so the key never reaches the browser:

```
ORS_API_KEY=your_ors_key
```

This is independent of `USE_MOCKS`, so you get real roads even while route plans are mocked. The same
geometry powers Ride Mode's off-route detection. Routing uses the `driving-car` profile for all ride
types in v1.

### Better-looking map (recommended)

The keyless fallback uses CARTO dark raster tiles. For crisp vector tiles, create a free
[MapTiler](https://www.maptiler.com/) key and set:

```
VITE_MAP_STYLE_URL=https://api.maptiler.com/maps/streets-v2-dark/style.json?key=YOUR_KEY
```

Restrict the key by domain in the MapTiler dashboard.

### Going live (real LLM / Places)

- **LLM:** route generation calls the **Anthropic Messages API** in
  [`server/src/llm/client.ts`](server/src/llm/client.ts) (via `@anthropic-ai/sdk`, with prompt
  caching on the planner system prompt and adaptive thinking). Set `LLM_API_KEY`, optionally
  `LLM_MODEL` (default `claude-opus-4-8`; `claude-haiku-4-5` is cheaper/faster), and `USE_MOCKS=false`.
  Any call failure falls back to a mock plan so the app never breaks.
- **Geocoding:** LLM waypoints have no coordinates, so they're geocoded via **OpenRouteService**
  ([`server/src/routing/geocode.ts`](server/src/routing/geocode.ts), reusing `ORS_API_KEY`) — this
  is what lets AI-generated routes appear on the map and follow roads. Without an ORS key, LLM
  routes still generate but render as a sparse pin list.
- **Places:** [`server/src/places/client.ts`](server/src/places/client.ts) has a Google Places Text
  Search call; set `GOOGLE_PLACES_API_KEY` and `USE_MOCKS=false`.

---

## Deploying to Vercel

The same tree deploys as a static client + one serverless function.

1. **Push to a Git repo** and import it in Vercel (or use the `vercel` CLI). The repo lives at
   <https://github.com/cj-ax/slow-route-planner>.
2. Vercel uses [`vercel.json`](vercel.json): build → `client/dist`, route `/api/*` to the serverless
   Express app, everything else → the SPA.
3. **Create a Vercel Blob store** and connect it to the project (Storage tab). Vercel injects
   `BLOB_READ_WRITE_TOKEN` automatically — the server then stores each route as its own JSON blob, so
   routes you save on your laptop show up on your phone.
4. **Set env vars** in the Vercel project:
   - `VITE_API_BASE_URL` → leave **unset** (client uses same-origin `/api`).
   - `VITE_MAP_STYLE_URL` → your MapTiler style URL (optional but recommended).
   - `ORS_API_KEY` → OpenRouteService key for road-following routes (recommended).
   - `LLM_API_KEY` / `LLM_MODEL` / `GOOGLE_PLACES_API_KEY` → only if going live; set `USE_MOCKS=false`.
5. Open the deployed URL on your phone, allow location, and ride.

> Local storage (`server/data/routes.json`) and production storage (Blob) are independent — routes
> don't sync between your local dev environment and the deployed app.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run server (`:3001`) + client (`:5173`) together |
| `npm run build` | Production build of the client → `client/dist` |
| `npm run typecheck` | Type-check shared, server, client, and the Vercel entry |
| `npm run lint` | ESLint across the repo |

---

## Not included (by design)

Auth / accounts / admin, payments, production security hardening, turn-by-turn navigation, voice or
lane guidance, traffic rerouting, offline / background GPS, CarPlay / Android Auto. Road-following
geometry is optional: with `ORS_API_KEY` set the map follows roads; without it, v1 draws straight
segments between waypoints.

**Speed limits are a preference, not a guarantee.** Route plans include a manual-check reminder to
verify speed limits before riding, and Google Maps may reroute onto faster roads — follow the planned
waypoints.
