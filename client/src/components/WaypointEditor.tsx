import { reorderWaypoints, type Waypoint } from "@srp/shared";
import { WaypointList } from "./WaypointList";

interface WaypointEditorProps {
  waypoints: Waypoint[];
  selectedId?: string;
  onSelectWaypoint: (id: string) => void;
  onChange: (next: Waypoint[]) => void;
}

export function WaypointEditor({
  waypoints,
  selectedId,
  onSelectWaypoint,
  onChange,
}: WaypointEditorProps) {
  function move(index: number, dir: -1 | 1) {
    onChange(reorderWaypoints(waypoints, index, index + dir));
  }

  function toggleLock(id: string) {
    onChange(waypoints.map((w) => (w.id === id ? { ...w, locked: !w.locked } : w)));
  }

  function remove(id: string) {
    onChange(waypoints.filter((w) => w.id !== id));
  }

  function editField(id: string, field: "label" | "query" | "purpose", value: string) {
    onChange(
      waypoints.map((w) => (w.id === id ? { ...w, [field]: value } : w)),
    );
  }

  function addWaypoint() {
    const newWaypoint: Waypoint = {
      id: crypto.randomUUID(),
      label: "New waypoint",
      query: "",
      purpose: "scenic",
      locked: false,
    };
    // Insert before the destination if there is one, else append.
    const destIdx = waypoints.findIndex((w) => w.purpose === "destination");
    if (destIdx >= 0) {
      const next = [...waypoints];
      next.splice(destIdx, 0, newWaypoint);
      onChange(next);
    } else {
      onChange([...waypoints, newWaypoint]);
    }
    onSelectWaypoint(newWaypoint.id);
  }

  return (
    <section className="panel waypoint-editor">
      <div className="panel__header">
        <h3>Waypoints</h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={addWaypoint}>
          + Add waypoint
        </button>
      </div>
      <WaypointList
        waypoints={waypoints}
        selectedId={selectedId}
        onSelect={onSelectWaypoint}
        onMove={move}
        onToggleLock={toggleLock}
        onRemove={remove}
        onEditField={editField}
      />
    </section>
  );
}
