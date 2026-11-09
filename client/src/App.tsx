import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import {
  BASE_LAYERS,
  DNR_HUNTING_RULES_URL,
  OVERLAYS,
  RADIUS_MI,
  VICTORIA,
  type BaseLayerId,
  type OverlayId,
} from "./config";
import { circlePolygon, pointInPolygon, type LonLat } from "./lib/geo";
import { AGENCIES, loadLandData, forceRefreshLand, type AgencyKey, type LandData, type Property } from "./lib/land";
import { LOG_TYPES, loadLogs, saveLog, deleteLog, type ScoutLog, type Season } from "./lib/logs";
import { loadPref, loadScalar, savePref } from "./lib/prefs";
import { WIND_DIRS, type WindDir } from "./lib/wind";
import { agencyFilter, buildStyle, LAND_SOURCE, LOGS_SOURCE, PARKING_SOURCE } from "./map/style";
import { LayersPanel } from "./components/LayersPanel";
import { PropertyList } from "./components/PropertyList";
import { PropertyDetail } from "./components/PropertyDetail";
import { LogForm, LogList } from "./components/Logs";

type Sheet = "none" | "layers" | "list" | "property" | "log" | "logs";

export interface OverlayState {
  on: boolean;
  opacity: number;
}

const defaultOverlays = (): Record<OverlayId, OverlayState> =>
  Object.fromEntries(
    Object.values(OVERLAYS).map((o) => [o.id, { on: false, opacity: o.defaultOpacity }]),
  ) as Record<OverlayId, OverlayState>;

const defaultAgencies = (): Record<AgencyKey, boolean> =>
  Object.fromEntries(Object.entries(AGENCIES).map(([k, v]) => [k, v.defaultOn])) as Record<AgencyKey, boolean>;

export function App() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [base, setBase] = useState<BaseLayerId>(() => loadScalar("base", "topo" as BaseLayerId));
  const [overlays, setOverlays] = useState(() => loadPref("overlays", defaultOverlays()));
  const [agencies, setAgencies] = useState(() => loadPref("agencies", defaultAgencies()));
  const [season, setSeason] = useState<Season>(() => loadScalar("season", "rut" as Season));
  const [wind, setWind] = useState<WindDir | "">(() => loadScalar("wind", "" as WindDir | ""));

  const [land, setLand] = useState<LandData | null>(null);
  const [landStatus, setLandStatus] = useState<string>("Loading public land…");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>("none");

  const [logs, setLogs] = useState<ScoutLog[]>([]);
  const [draftAt, setDraftAt] = useState<{ at: LonLat; source: "gps" | "map"; accuracy: number | null } | null>(null);
  const [editing, setEditing] = useState<ScoutLog | null>(null);

  const [gps, setGps] = useState<GeolocationPosition | null>(null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const watchId = useRef<number | null>(null);
  const gpsMarker = useRef<maplibregl.Marker | null>(null);
  const followRef = useRef(false);

  // ---------- map init ----------
  useEffect(() => {
    if (!mapEl.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: buildStyle(base, circlePolygon(VICTORIA, RADIUS_MI)),
      center: VICTORIA,
      zoom: 8.3,
      maxZoom: 18,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");
    map.on("load", () => setMapReady(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---------- base / overlays ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const id of Object.keys(BASE_LAYERS))
      map.setLayoutProperty(`base-${id}`, "visibility", id === base ? "visible" : "none");
    savePref("base", base);
  }, [base, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const [id, st] of Object.entries(overlays)) {
      map.setLayoutProperty(`ov-${id}`, "visibility", st.on ? "visible" : "none");
      map.setPaintProperty(`ov-${id}`, "raster-opacity", st.opacity);
    }
    savePref("overlays", overlays);
  }, [overlays, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const f = agencyFilter(agencies) as never;
    for (const l of ["land-fill", "land-line", "land-label"]) map.setFilter(l, f);
    savePref("agencies", agencies);
  }, [agencies, mapReady]);

  useEffect(() => savePref("season", season), [season]);
  useEffect(() => savePref("wind", wind), [wind]);

  // ---------- data ----------
  useEffect(() => {
    let cancelled = false;
    loadLandData((d, fromCache) => {
      if (cancelled) return;
      setLand(d);
      setLandStatus(
        `${d.properties.length} public properties${fromCache ? " (cached)" : ""}` +
          (d.warnings.length ? `. Warning: ${d.warnings.join("; ")}` : ""),
      );
    }).catch((e: Error) => !cancelled && setLandStatus(`Public land failed to load: ${e.message}`));
    loadLogs().then((l) => !cancelled && setLogs(l)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !land) return;
    (map.getSource(LAND_SOURCE) as GeoJSONSource).setData(land.polygons);
    (map.getSource(PARKING_SOURCE) as GeoJSONSource).setData(land.parking);
  }, [land, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const groupOf = (t: string) => LOG_TYPES.find((x) => x.id === t)?.group ?? "waypoint";
    const labelOf = (t: string) => LOG_TYPES.find((x) => x.id === t)?.label ?? t;
    (map.getSource(LOGS_SOURCE) as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: logs.map((l) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [l.lon, l.lat] },
        properties: { id: l.id, group: groupOf(l.type), label: labelOf(l.type) },
      })),
    });
  }, [logs, mapReady]);

  const propsById = useMemo(() => new Map(land?.properties.map((p) => [p.id, p]) ?? []), [land]);
  const selected = selectedId ? propsById.get(selectedId) ?? null : null;

  // Highlight selected property
  const prevSel = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !land) return;
    if (prevSel.current) map.setFeatureState({ source: LAND_SOURCE, id: prevSel.current }, { selected: false });
    if (selectedId) map.setFeatureState({ source: LAND_SOURCE, id: selectedId }, { selected: true });
    prevSel.current = selectedId;
  }, [selectedId, mapReady, land]);

  const propertyAt = useCallback(
    (pt: LonLat): Property | null => {
      if (!land) return null;
      for (const f of land.polygons.features) {
        const g = f.geometry;
        if ((g.type === "Polygon" || g.type === "MultiPolygon") && pointInPolygon(pt, g))
          return propsById.get(f.properties?.pid) ?? null;
      }
      return null;
    },
    [land, propsById],
  );

  // ---------- map interactions ----------
  const openLogAt = useCallback((at: LonLat, source: "gps" | "map", accuracy: number | null) => {
    setEditing(null);
    setDraftAt({ at, source, accuracy });
    setSheet("log");
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const logHit = map.queryRenderedFeatures(e.point, { layers: ["logs"] })[0];
      if (logHit) {
        const l = logs.find((x) => x.id === logHit.properties?.id);
        if (l) {
          setEditing(l);
          setDraftAt(null);
          setSheet("log");
          return;
        }
      }
      const hit = map.queryRenderedFeatures(e.point, { layers: ["land-fill"] })[0];
      if (hit?.properties?.pid) {
        setSelectedId(hit.properties.pid as string);
        setSheet("property");
      }
    };
    // Long-press (contextmenu fires on touch-hold in MapLibre) drops a log.
    const onHold = (e: maplibregl.MapMouseEvent) => openLogAt([e.lngLat.lng, e.lngLat.lat], "map", null);
    map.on("click", onClick);
    map.on("contextmenu", onHold);
    const enter = () => (map.getCanvas().style.cursor = "pointer");
    const leave = () => (map.getCanvas().style.cursor = "");
    map.on("mouseenter", "land-fill", enter);
    map.on("mouseleave", "land-fill", leave);
    const stopFollow = () => (followRef.current = false);
    map.on("dragstart", stopFollow);
    return () => {
      map.off("click", onClick);
      map.off("contextmenu", onHold);
      map.off("mouseenter", "land-fill", enter);
      map.off("mouseleave", "land-fill", leave);
      map.off("dragstart", stopFollow);
    };
  }, [mapReady, logs, openLogAt]);

  const flyToProperty = useCallback((p: Property) => {
    const map = mapRef.current;
    if (!map) return;
    const pad = window.innerWidth < 700 ? { top: 70, bottom: window.innerHeight * 0.45, left: 30, right: 30 } : 80;
    map.fitBounds(
      [
        [p.bbox[0], p.bbox[1]],
        [p.bbox[2], p.bbox[3]],
      ],
      { padding: pad, maxZoom: 15, duration: 800 },
    );
  }, []);

  // ---------- GPS ----------
  const startGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsErr("Geolocation not supported on this device");
      return;
    }
    if (watchId.current !== null) {
      // Already tracking: recenter.
      followRef.current = true;
      if (gps) mapRef.current?.easeTo({ center: [gps.coords.longitude, gps.coords.latitude], zoom: Math.max(mapRef.current.getZoom(), 15) });
      return;
    }
    followRef.current = true;
    setTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsErr(null);
        setGps(pos);
      },
      (err) => setGpsErr(err.message || "Location unavailable"),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
  }, [gps]);

  const stopGps = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setTracking(false);
    gpsMarker.current?.remove();
    gpsMarker.current = null;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gps) return;
    const ll: LonLat = [gps.coords.longitude, gps.coords.latitude];
    if (!gpsMarker.current) {
      const el = document.createElement("div");
      el.className = "gps-dot";
      el.innerHTML = '<span class="gps-dot__pulse"></span><span class="gps-dot__core"></span>';
      gpsMarker.current = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
      map.easeTo({ center: ll, zoom: Math.max(map.getZoom(), 15) });
    } else {
      gpsMarker.current.setLngLat(ll);
      if (followRef.current) map.easeTo({ center: ll, duration: 500 });
    }
  }, [gps]);

  useEffect(() => () => stopGps(), [stopGps]);

  const logAtGps = () => {
    if (gps) openLogAt([gps.coords.longitude, gps.coords.latitude], "gps", Math.round(gps.coords.accuracy));
    else {
      const c = mapRef.current?.getCenter();
      if (c) openLogAt([c.lng, c.lat], "map", null);
    }
  };

  // ---------- logs ----------
  const onSaveLog = async (l: ScoutLog) => {
    const withProp = { ...l, propertyId: l.propertyId ?? propertyAt([l.lon, l.lat])?.id ?? null };
    await saveLog(withProp);
    setLogs(await loadLogs());
    setSheet("none");
    setDraftAt(null);
    setEditing(null);
  };
  const onDeleteLog = async (id: string) => {
    await deleteLog(id);
    setLogs(await loadLogs());
    if (editing?.id === id) {
      setEditing(null);
      setSheet("logs");
    }
  };

  const refreshLand = async () => {
    setLandStatus("Refreshing public land…");
    try {
      const d = await forceRefreshLand();
      setLand(d);
      setLandStatus(`${d.properties.length} public properties (refreshed)`);
    } catch (e) {
      setLandStatus(`Refresh failed: ${(e as Error).message}`);
    }
  };

  const toggleSheet = (s: Sheet) => setSheet((cur) => (cur === s ? "none" : s));

  return (
    <div className="app">
      <div ref={mapEl} className="map" />

      <header className="topbar">
        <div className="brand">
          <strong>Deer Scout</strong>
          <span className="status" title={landStatus}>
            {landStatus}
          </span>
        </div>
        <div className="topbar__controls">
          <label className="mini">
            <span>Season</span>
            <select value={season} onChange={(e) => setSeason(e.target.value as Season)}>
              <option value="early">Early archery</option>
              <option value="rut">Rut</option>
              <option value="late">Late</option>
            </select>
          </label>
          <label className="mini">
            <span>Wind from</span>
            <select value={wind} onChange={(e) => setWind(e.target.value as WindDir | "")}>
              <option value="">?</option>
              {WIND_DIRS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <nav className="fabs">
        <button className={`fab ${tracking ? "fab--on" : ""}`} onClick={startGps} aria-label="My location" title="My location">
          ◎
        </button>
        {tracking && (
          <button className="fab fab--small" onClick={stopGps} aria-label="Stop GPS" title="Stop GPS">
            ✕
          </button>
        )}
        <button className="fab fab--accent" onClick={logAtGps} aria-label="Log sign here" title="Log sign at my location">
          ＋
        </button>
      </nav>
      {gpsErr && <div className="toast">GPS: {gpsErr}</div>}

      <div className={`sheet ${sheet !== "none" ? "sheet--open" : ""}`}>
        {sheet !== "none" && (
          <button className="sheet__close" onClick={() => setSheet("none")} aria-label="Close">
            ✕
          </button>
        )}
        {sheet === "layers" && (
          <LayersPanel
            base={base}
            setBase={setBase}
            overlays={overlays}
            setOverlays={setOverlays}
            agencies={agencies}
            setAgencies={setAgencies}
            onRefreshLand={refreshLand}
          />
        )}
        {sheet === "list" && (
          <PropertyList
            properties={land?.properties ?? []}
            agencies={agencies}
            logs={logs}
            onPick={(p) => {
              setSelectedId(p.id);
              setSheet("property");
              flyToProperty(p);
            }}
          />
        )}
        {sheet === "property" && selected && (
          <PropertyDetail
            p={selected}
            base={base}
            overlays={(Object.keys(overlays) as OverlayId[]).filter((k) => overlays[k].on)}
            logCount={logs.filter((l) => l.propertyId === selected.id).length}
            onZoom={() => flyToProperty(selected)}
            onBack={() => setSheet("list")}
          />
        )}
        {sheet === "log" && (draftAt || editing) && (
          <LogForm
            key={editing?.id ?? `${draftAt?.at.join(",")}`}
            draft={draftAt}
            existing={editing}
            season={season}
            wind={wind}
            propertyName={(() => {
              const at = editing ? ([editing.lon, editing.lat] as LonLat) : draftAt!.at;
              return propertyAt(at)?.name ?? null;
            })()}
            onSave={onSaveLog}
            onDelete={onDeleteLog}
            onCancel={() => setSheet("none")}
          />
        )}
        {sheet === "logs" && (
          <LogList
            logs={logs}
            propsById={propsById}
            onPick={(l) => {
              setEditing(l);
              setDraftAt(null);
              setSheet("log");
              mapRef.current?.easeTo({ center: [l.lon, l.lat], zoom: Math.max(mapRef.current.getZoom(), 15) });
            }}
          />
        )}
      </div>

      <nav className="tabbar">
        <button className={sheet === "list" || sheet === "property" ? "on" : ""} onClick={() => toggleSheet("list")}>
          Properties
        </button>
        <button className={sheet === "layers" ? "on" : ""} onClick={() => toggleSheet("layers")}>
          Layers
        </button>
        <button className={sheet === "logs" || sheet === "log" ? "on" : ""} onClick={() => toggleSheet("logs")}>
          Log ({logs.length})
        </button>
      </nav>
      <footer className="disclaimer">
        Scouting aid only, not a success predictor. Verify boundaries, regulations, and hunting access with{" "}
        <a href={DNR_HUNTING_RULES_URL} target="_blank" rel="noreferrer">
          MN DNR
        </a>{" "}
        before hunting. Data may be outdated.
      </footer>
    </div>
  );
}
