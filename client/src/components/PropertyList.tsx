import { useMemo, useState } from "react";
import { AGENCIES, type AgencyKey, type Property } from "../lib/land";
import { formatMi } from "../lib/geo";
import type { ScoutLog } from "../lib/logs";
import { loadPref, savePref } from "../lib/prefs";

interface Props {
  properties: Property[];
  agencies: Record<AgencyKey, boolean>;
  logs: ScoutLog[];
  onPick: (p: Property) => void;
}

type Sort = "distance" | "size" | "name" | "logs";

interface Filters {
  maxMi: number;
  minAcres: number;
  deerListedOnly: boolean;
  sort: Sort;
  q: string;
}

const DEFAULT: Filters = { maxMi: 75, minAcres: 40, deerListedOnly: false, sort: "distance", q: "" };

export function filterProperties(
  props: Property[],
  f: Filters,
  agencies: Record<AgencyKey, boolean>,
  logCounts: Map<string, number> = new Map(),
): Property[] {
  const q = f.q.trim().toLowerCase();
  const out = props.filter(
    (p) =>
      agencies[p.agency] &&
      p.distMi <= f.maxMi &&
      p.acres >= f.minAcres &&
      (!f.deerListedOnly || p.hunting === "listed") &&
      (!q || p.name.toLowerCase().includes(q)),
  );
  const cmp: Record<Sort, (a: Property, b: Property) => number> = {
    distance: (a, b) => a.distMi - b.distMi,
    size: (a, b) => b.acres - a.acres,
    name: (a, b) => a.name.localeCompare(b.name),
    logs: (a, b) => (logCounts.get(b.id) ?? 0) - (logCounts.get(a.id) ?? 0) || a.distMi - b.distMi,
  };
  return out.sort(cmp[f.sort]);
}

export function PropertyList({ properties, agencies, logs, onPick }: Props) {
  const [f, setF] = useState<Filters>(() => loadPref("filters", DEFAULT));
  const update = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setF(next);
    savePref("filters", { ...next, q: "" });
  };
  const logCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) if (l.propertyId) m.set(l.propertyId, (m.get(l.propertyId) ?? 0) + 1);
    return m;
  }, [logs]);
  const list = useMemo(() => filterProperties(properties, f, agencies, logCounts), [properties, f, agencies, logCounts]);

  return (
    <div className="panel">
      <h2>
        Properties <small className="muted">({list.length})</small>
      </h2>
      <div className="filters">
        <input type="search" placeholder="Search name" value={f.q} onChange={(e) => update({ q: e.target.value })} />
        <label>
          Within {f.maxMi} mi
          <input type="range" min={5} max={75} step={5} value={f.maxMi} onChange={(e) => update({ maxMi: +e.target.value })} />
        </label>
        <label>
          At least {f.minAcres} ac
          <input type="range" min={0} max={1000} step={20} value={f.minAcres} onChange={(e) => update({ minAcres: +e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={f.deerListedOnly} onChange={(e) => update({ deerListedOnly: e.target.checked })} />
          <span>Only where DNR lists deer hunting</span>
        </label>
        <label>
          Sort
          <select value={f.sort} onChange={(e) => update({ sort: e.target.value as Sort })}>
            <option value="distance">Distance from Victoria</option>
            <option value="size">Size</option>
            <option value="logs">My log count</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <p className="muted small">
        Habitat scores and heat maps need the processing pipeline (not yet run). Distances are straight-line to the
        nearest boundary.
      </p>
      <ul className="plist">
        {list.slice(0, 300).map((p) => (
          <li key={p.id}>
            <button onClick={() => onPick(p)}>
              <span className="swatch" style={{ background: AGENCIES[p.agency].color }} />
              <span className="plist__main">
                <span className="plist__name">{p.name}</span>
                <span className="plist__meta">
                  {p.acres.toLocaleString()} ac · {formatMi(p.distMi)} · {p.state}
                  {p.parkingMi !== null ? ` · P ${p.parkingCount}` : ""}
                  {logCounts.get(p.id) ? ` · ${logCounts.get(p.id)} logs` : ""}
                </span>
              </span>
              {p.hunting === "listed" ? <span className="badge badge--ok">deer listed</span> : <span className="badge">verify</span>}
            </button>
          </li>
        ))}
      </ul>
      {list.length > 300 && <p className="muted small">Showing first 300. Narrow the filters to see more.</p>}
    </div>
  );
}
