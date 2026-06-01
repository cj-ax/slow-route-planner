import type { Waypoint, WaypointPurpose } from "@srp/shared";
import { PURPOSE_META, PURPOSE_ORDER } from "../map/purpose";

interface WaypointListProps {
  waypoints: Waypoint[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onToggleLock: (id: string) => void;
  onRemove: (id: string) => void;
  onEditField: (id: string, field: "label" | "query" | "purpose", value: string) => void;
}

export function WaypointList({
  waypoints,
  selectedId,
  onSelect,
  onMove,
  onToggleLock,
  onRemove,
  onEditField,
}: WaypointListProps) {
  if (waypoints.length === 0) {
    return <p className="muted">No waypoints yet.</p>;
  }

  return (
    <ol className="waypoint-list">
      {waypoints.map((w, index) => {
        const meta = PURPOSE_META[w.purpose];
        const selected = w.id === selectedId;
        const hasCoords = w.lat !== undefined && w.lng !== undefined;
        return (
          <li
            key={w.id}
            className={`waypoint${selected ? " waypoint--selected" : ""}`}
            onClick={() => onSelect(w.id)}
          >
            <span
              className="waypoint__dot"
              style={{ background: meta.color }}
              title={meta.label}
            >
              {index + 1}
            </span>
            <div className="waypoint__body" onClick={(e) => e.stopPropagation()}>
              <input
                className="waypoint__label"
                value={w.label}
                onChange={(e) => onEditField(w.id, "label", e.target.value)}
                placeholder="Label"
              />
              <input
                className="waypoint__query"
                value={w.query}
                onChange={(e) => onEditField(w.id, "query", e.target.value)}
                placeholder="Map search query"
              />
              <div className="waypoint__meta">
                <select
                  className="waypoint__purpose"
                  value={w.purpose}
                  onChange={(e) =>
                    onEditField(w.id, "purpose", e.target.value as WaypointPurpose)
                  }
                >
                  {PURPOSE_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {PURPOSE_META[p].label}
                    </option>
                  ))}
                </select>
                {!hasCoords && <span className="waypoint__nocoords">no map pin</span>}
              </div>
              {w.reason && <p className="waypoint__reason">{w.reason}</p>}
            </div>
            <div className="waypoint__controls" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                title="Move up"
                disabled={index === 0}
                onClick={() => onMove(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                title="Move down"
                disabled={index === waypoints.length - 1}
                onClick={() => onMove(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                title={w.locked ? "Unlock" : "Lock"}
                className={w.locked ? "is-active" : ""}
                onClick={() => onToggleLock(w.id)}
              >
                {w.locked ? "🔒" : "🔓"}
              </button>
              <button
                type="button"
                title="Remove"
                className="danger"
                onClick={() => onRemove(w.id)}
              >
                ✕
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
