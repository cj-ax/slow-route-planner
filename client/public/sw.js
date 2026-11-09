/* Deer Scout service worker.
 * - Precaches the app shell (list injected at build time).
 * - Tiles: cache-first from the offline cache (property downloads), then a
 *   bounded runtime cache, then network.
 * - Everything else same-origin: network-first with cache fallback.
 */
const VERSION = "__BUILD_ID__";
const SHELL = `deer-shell-${VERSION}`;
const RUNTIME_TILES = "deer-tiles-runtime-v1";
const OFFLINE_TILES = "deer-tiles-offline-v1";
const PRECACHE = self.__PRECACHE__ || [];
const MAX_RUNTIME_TILES = 1500;

const TILE_HOSTS = [
  "basemap.nationalmap.gov",
  "imagery.nationalmap.gov",
  "elevation.nationalmap.gov",
  "enterprise.gisdata.mn.gov",
  "www.mrlc.gov",
  "fwspublicservices.wim.usgs.gov",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("deer-shell-") && k !== SHELL).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

let trimming = false;
async function trimRuntime() {
  if (trimming) return;
  trimming = true;
  try {
    const c = await caches.open(RUNTIME_TILES);
    const keys = await c.keys();
    const extra = keys.length - MAX_RUNTIME_TILES;
    for (let i = 0; i < extra; i++) await c.delete(keys[i]);
  } finally {
    trimming = false;
  }
}

async function tileResponse(req) {
  const offline = await caches.open(OFFLINE_TILES);
  const hit = await offline.match(req.url);
  if (hit) return hit;
  const runtime = await caches.open(RUNTIME_TILES);
  const rhit = await runtime.match(req.url);
  if (rhit) return rhit;
  const res = await fetch(req);
  if (res.ok) {
    runtime.put(req.url, res.clone()).then(trimRuntime);
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (TILE_HOSTS.includes(url.hostname) && !url.pathname.endsWith("/query")) {
    e.respondWith(tileResponse(req));
    return;
  }
  // Pipeline data (PMTiles range requests, JSON) goes straight to the network.
  if (url.pathname.includes("/data/")) return;
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && (req.mode === "navigate" || PRECACHE.some((p) => url.pathname.endsWith(p.replace(/^\.\//, ""))))) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const c = await caches.open(SHELL);
          return (await c.match(req, { ignoreSearch: true })) || (await c.match("./index.html")) || Response.error();
        }),
    );
  }
});
