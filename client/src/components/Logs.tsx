import { useState } from "react";
import type { LonLat } from "../lib/geo";
import {
  LOG_TYPES,
  labelFor,
  logsToGeoJSON,
  logsToGpx,
  downloadText,
  newLog,
  type LogType,
  type ScoutLog,
  type Season,
} from "../lib/logs";
import { degToDir, windDeg, WIND_DIRS, type WindDir } from "../lib/wind";
import type { Property } from "../lib/land";

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};

interface FormProps {
  draft: { at: LonLat; source: "gps" | "map"; accuracy: number | null } | null;
  existing: ScoutLog | null;
  season: Season;
  wind: WindDir | "";
  propertyName: string | null;
  onSave: (l: ScoutLog) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}

export function LogForm({ draft, existing, season, wind, propertyName, onSave, onDelete, onCancel }: FormProps) {
  const [log, setLog] = useState<ScoutLog>(
    () =>
      existing ??
      newLog("rub", draft!.at, {
        locationSource: draft!.source,
        accuracyM: draft!.accuracy,
        season,
        windFromDeg: wind ? windDeg(wind) : null,
      }),
  );
  const set = (patch: Partial<ScoutLog>) => setLog((l) => ({ ...l, ...patch }));
  const isSighting = log.type === "doe" || log.type === "buck";

  return (
    <div className="panel">
      <h2>{existing ? "Edit log" : "Quick log"}</h2>
      <p className="muted small">
        {log.lat.toFixed(5)}, {log.lon.toFixed(5)}
        {log.locationSource === "gps" && log.accuracyM !== null ? ` · GPS ±${log.accuracyM} m` : " · placed on map"}
        {propertyName ? ` · ${propertyName}` : " · not inside a mapped public property"}
      </p>
      <div className="type-grid">
        {LOG_TYPES.map((t) => (
          <button
            key={t.id}
            className={`chip chip--${t.group} ${log.type === t.id ? "on" : ""}`}
            onClick={() => set({ type: t.id as LogType, count: t.group === "sighting" ? Math.max(1, log.count) : 0 })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="filters">
        <label>
          When
          <input
            type="datetime-local"
            value={toLocalInput(log.observedAt)}
            onChange={(e) => e.target.value && set({ observedAt: new Date(e.target.value).toISOString() })}
          />
        </label>
        {isSighting && (
          <label>
            Count
            <input type="number" min={1} max={50} value={log.count} onChange={(e) => set({ count: Math.max(1, +e.target.value) })} />
          </label>
        )}
        <label>
          Season
          <select value={log.season} onChange={(e) => set({ season: e.target.value as Season })}>
            <option value="early">Early archery</option>
            <option value="rut">Rut</option>
            <option value="late">Late</option>
          </select>
        </label>
        <label>
          Wind from
          <select
            value={log.windFromDeg === null ? "" : degToDir(log.windFromDeg)}
            onChange={(e) => set({ windFromDeg: e.target.value ? windDeg(e.target.value as WindDir) : null })}
          >
            <option value="">unknown</option>
            {WIND_DIRS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Confidence
          <select value={log.confidence} onChange={(e) => set({ confidence: +e.target.value as 1 | 2 | 3 })}>
            <option value={1}>Low</option>
            <option value={2}>Medium</option>
            <option value={3}>High</option>
          </select>
        </label>
        <label className="full">
          Notes
          <textarea rows={3} value={log.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Size, freshness, direction of travel…" />
        </label>
      </div>
      <div className="row">
        <button className="btn btn--accent" onClick={() => onSave(log)}>
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        {existing && (
          <button className="btn btn--danger" onClick={() => confirm("Delete this log?") && onDelete(existing.id)}>
            Delete
          </button>
        )}
      </div>
      {!existing && <p className="muted small">Tip: long-press the map to log at any spot.</p>}
    </div>
  );
}

interface ListProps {
  logs: ScoutLog[];
  propsById: Map<string, Property>;
  onPick: (l: ScoutLog) => void;
}

export function LogList({ logs, propsById, onPick }: ListProps) {
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="panel">
      <h2>Scouting log ({logs.length})</h2>
      <div className="row">
        <button className="btn" disabled={!logs.length} onClick={() => downloadText(`deer-scout-${stamp}.gpx`, logsToGpx(logs), "application/gpx+xml")}>
          Export GPX
        </button>
        <button
          className="btn"
          disabled={!logs.length}
          onClick={() => downloadText(`deer-scout-${stamp}.geojson`, JSON.stringify(logsToGeoJSON(logs), null, 1), "application/geo+json")}
        >
          Export GeoJSON
        </button>
      </div>
      {!logs.length && <p className="muted">No logs yet. Tap ＋ to log at your GPS position, or long-press the map.</p>}
      <ul className="plist">
        {logs.map((l) => (
          <li key={l.id}>
            <button onClick={() => onPick(l)}>
              <span className="plist__main">
                <span className="plist__name">
                  {labelFor(l.type)}
                  {l.count > 1 ? ` ×${l.count}` : ""}
                </span>
                <span className="plist__meta">
                  {new Date(l.observedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  {l.propertyId ? ` · ${propsById.get(l.propertyId)?.name ?? ""}` : ""}
                  {l.notes ? ` · ${l.notes.slice(0, 60)}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small">Logs are stored only on this device (IndexedDB). Export regularly to back them up.</p>
    </div>
  );
}
