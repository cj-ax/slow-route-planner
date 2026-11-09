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
import { Protocol } from "pmtiles";
import { addScoutLayers, agencyFilter, buildStyle, CANDIDATES_SOURCE, LAND_SOURCE, GOVLAND_SOURCE, LOGS_SOURCE, PARCELS_SOURCE, PARKING_SOURCE, SEASONS_LIST } from "./map/style";
import { GOV_TYPES, govLandLayer, govLandNote, parcelsLayer, PARCEL_MIN_ZOOM, type GovType } from "./lib/parcels";
import {
  breakdownAt,
  loadCandidates,
  loadMeta,
  loadRankings,
  windFit,
  type CandidateProps,
  type PointBreakdown,
  type Ranking,
  type ScoutMeta,
} from "./lib/scout";
import { CandidateDetail, DEFAULT_SCOUT_LAYERS, PointCard, type ScoutLayerState } from "./components/Scout";
import { LayersPanel } from "./components/LayersPanel";
import { PropertyList } from "./components/PropertyList";
import { PropertyDetail } from "./components/PropertyDetail";
import { LogForm, LogList } from "./components/Logs";

type Sheet = "none" | "layers" | "list" | "property" | "log" | "logs" | "cand";

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

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

  const [meta, setMeta] = useState<ScoutMeta | null>(null);
  const [rankings, setRankings] = useState<Map<string, Ranking>>(new Map());
  const [candidates, setCandidates] = useState<GeoJSON.FeatureCollection<GeoJSON.Point, CandidateProps> | null>(null);
  const [scoutLayers, setScoutLayers] = useState<ScoutLayerState>(() => loadPref("scoutLayers", DEFAULT_SCOUT_LAYERS));
  const [pointInfo, setPointInfo] = useState<{ lngLat: LonLat; loading: boolean; b: PointBreakdown | null } | null>(null);
  const [cand, setCand] = useState<CandidateProps | null>(null);
  const [parcelsOn, setParcelsOn] = useState<boolean>(() => loadScalar("parcels", false));
  const [govTypes, setGovTypes] = useState<Record<GovType, boolean>>(() =>
    loadPref("govTypes", Object.fromEntries(Object.entries(GOV_TYPES).map(([k, v]) => [k, v.defaultOn])) as Record<GovType, boolean>),
  );
  const [govInfo, setGovInfo] = useState<{ type: string; county: string } | null>(null);

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
    loadMeta().then((m) => {
      if (cancelled || !m) return;
      setMeta(m);
      loadRankings().then((r) => !cancelled && setRankings(r));
      // Candidates are bigger; fetch after first paint.
      setTimeout(() => loadCandidates().then((c) => !cancelled && c && setCandidates(c)), 800);
    });
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !meta) return;
    addScoutLayers(map, meta.zoom);
  }, [mapReady, meta]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !meta || !map.getLayer("heat-rut")) return;
    for (const s of SEASONS_LIST) {
      map.setLayoutProperty(`heat-${s}`, "visibility", scoutLayers.heat && s === season ? "visible" : "none");
      map.setPaintProperty(`heat-${s}`, "raster-opacity", scoutLayers.heatOpacity);
    }
    map.setLayoutProperty("corridors", "visibility", scoutLayers.corridors ? "visible" : "none");
    map.setLayoutProperty("cand-stand", "visibility", scoutLayers.stands ? "visible" : "none");
    map.setLayoutProperty("cand-bedding", "visibility", scoutLayers.bedding ? "visible" : "none");
    map.setLayoutProperty("cand-funnel", "visibility", scoutLayers.funnels ? "visible" : "none");
    map.setFilter("cand-stand", ["all", ["==", ["get", "kind"], "stand"], ["==", ["get", "season"], season]]);
    map.setFilter("cand-label", [
      "any",
      ["all", ["==", ["get", "kind"], "stand"], ["==", ["get", "season"], season], ["literal", scoutLayers.stands]],
      ["all", ["==", ["get", "kind"], "bedding"], ["literal", scoutLayers.bedding]],
      ["all", ["==", ["get", "kind"], "funnel"], ["literal", scoutLayers.funnels]],
    ]);
    savePref("scoutLayers", scoutLayers);
  }, [mapReady, meta, scoutLayers, season]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !candidates || !map.getSource(CANDIDATES_SOURCE)) return;
    (map.getSource(CANDIDATES_SOURCE) as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: candidates.features.map((f) => ({
        ...f,
        properties: { ...f.properties, fit: windFit(f.properties.wind, wind) },
      })),
    });
  }, [candidates, wind, mapReady, meta]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty("parcels", "visibility", parcelsOn ? "visible" : "none");
    savePref("parcels", parcelsOn);
    if (!parcelsOn) return;
    let cancelled = false;
    const refresh = () => {
      if (map.getZoom() < PARCEL_MIN_ZOOM) return;
      const b = map.getBounds();
      parcelsLayer
        .forView([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
        .then((fc) => !cancelled && (map.getSource(PARCELS_SOURCE) as GeoJSONSource).setData(fc))
        .catch(() => undefined);
    };
    refresh();
    map.on("moveend", refresh);
    return () => {
      cancelled = true;
      map.off("moveend", refresh);
    };
  }, [parcelsOn, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const on = (Object.keys(govTypes) as GovType[]).filter((k) => govTypes[k]);
    const vis = on.length ? "visible" : "none";
    for (const l of ["govland-fill", "govland-line"]) {
      map.setLayoutProperty(l, "visibility", vis);
      map.setFilter(l, ["in", ["get", "govt_own"], ["literal", on]]);
    }
    savePref("govTypes", govTypes);
    if (!on.length) return;
    let cancelled = false;
    const refresh = () => {
      if (map.getZoom() < govLandLayer.minZoom) return;
      const b = map.getBounds();
      govLandLayer
        .forView([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
        .then((fc) => !cancelled && (map.getSource(GOVLAND_SOURCE) as GeoJSONSource).setData(fc))
        .catch(() => undefined);
    };
    refresh();
    map.on("moveend", refresh);
    return () => {
      cancelled = true;
      map.off("moveend", refresh);
    };
  }, [govTypes, mapReady]);

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
      const candLayers = ["cand-stand", "cand-bedding", "cand-funnel"].filter((l) => map.getLayer(l));
      const candHit = candLayers.length ? map.queryRenderedFeatures(e.point, { layers: candLayers })[0] : undefined;
      if (candHit) {
        const p = candHit.properties as Record<string, unknown>;
        const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
        setCand({ ...(p as unknown as CandidateProps), reasons: parse(p.reasons), wind: parse(p.wind), entry: parse(p.entry) });
        setSelectedId(p.pid as string);
        setSheet("cand");
        return;
      }
      const govHit = map.getLayer("govland-fill") ? map.queryRenderedFeatures(e.point, { layers: ["govland-fill"] })[0] : undefined;
      setGovInfo(govHit ? { type: String(govHit.properties?.govt_own ?? ""), county: String(govHit.properties?.co_name ?? "") } : null);
      if (meta) {
        const ll: LonLat = [e.lngLat.lng, e.lngLat.lat];
        setPointInfo({ lngLat: ll, loading: true, b: null });
        breakdownAt(ll[0], ll[1], meta.zoom.max).then((b) =>
          setPointInfo((cur) => (cur && cur.lngLat === ll ? { ...cur, loading: false, b } : cur)),
        );
      }
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
  }, [mapReady, logs, openLogAt, meta]);

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
      {govInfo && (
        <div className="point-card" style={pointInfo && meta ? { top: "auto", bottom: "calc(var(--tab-h) + var(--disc-h) + 20px)" } : undefined}>
          <button className="point-card__close" onClick={() => setGovInfo(null)} aria-label="Close">
            ✕
          </button>
          <strong>{GOV_TYPES[govInfo.type as GovType]?.label ?? govInfo.type}</strong>
          <span className="muted small"> · {govInfo.county} County</span>
          <p className="small">{govLandNote(govInfo.type)}</p>
        </div>
      )}
      {pointInfo && meta && <PointCard info={pointInfo} meta={meta} season={season} onClose={() => setPointInfo(null)} />}

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
            meta={meta}
            scoutLayers={scoutLayers}
            setScoutLayers={setScoutLayers}
            parcelsOn={parcelsOn}
            setParcelsOn={setParcelsOn}
            govTypes={govTypes}
            setGovTypes={setGovTypes}
          />
        )}
        {sheet === "list" && (
          <PropertyList
            properties={land?.properties ?? []}
            agencies={agencies}
            logs={logs}
            rankings={rankings}
            season={season}
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
            ranking={rankings.get(selected.id) ?? null}
            season={season}
            seasonLabel={meta?.seasons[season]?.label ?? season}
            stands={(candidates?.features ?? []).filter((f) => f.properties.pid === selected.id && f.properties.kind === "stand" && f.properties.season === season)}
            wind={wind}
            onStand={(f) => {
              setCand(f.properties);
              setSheet("cand");
              mapRef.current?.easeTo({ center: f.geometry.coordinates as LonLat, zoom: Math.max(mapRef.current.getZoom(), 15) });
            }}
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
        {sheet === "cand" && cand && (
          <CandidateDetail
            c={cand}
            wind={wind}
            onProperty={() => {
              setSelectedId(cand.pid);
              setSheet("property");
            }}
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
        <button className={sheet === "list" || sheet === "property" || sheet === "cand" ? "on" : ""} onClick={() => toggleSheet("list")}>
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
