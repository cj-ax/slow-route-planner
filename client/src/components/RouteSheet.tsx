import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  calculateDistanceMeters,
  formatDistance,
  type RoutePlan,
  type Waypoint,
} from "@srp/shared";
import { useMapRoute } from "../hooks/useMapRoute";
import { useRouteGeometry } from "../hooks/useRouteGeometry";
import { PURPOSE_META } from "../map/purpose";

type Snap = "collapsed" | "half" | "expanded";

/** Rough planning pace for a slow scenic ride (~30 km/h). */
const PACE_MPS = 8.3;
const COLLAPSED_PEEK = 132; // px of header visible when collapsed

interface RouteSheetProps {
  plan: RoutePlan;
  selectedWaypointId?: string;
  onStartRide: () => void;
  onSave: () => void;
  saving: boolean;
  savedId?: string;
  onShare?: () => void;
  /** Detailed editors (waypoint list, place options, notes) shown when expanded. */
  children?: ReactNode;
}

function hasCoords(w: Waypoint): w is Waypoint & { lat: number; lng: number } {
  return w.lat !== undefined && w.lng !== undefined;
}

function sumMeters(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    total += calculateDistanceMeters({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
  }
  return total;
}

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function snapTranslate(snap: Snap, vh: number): number {
  if (snap === "expanded") return 0;
  if (snap === "half") return vh * 0.42;
  return vh * 0.92 - COLLAPSED_PEEK;
}

export function RouteSheet({
  plan,
  selectedWaypointId,
  onStartRide,
  onSave,
  saving,
  savedId,
  onShare,
  children,
}: RouteSheetProps) {
  const route = useMapRoute(plan);
  const { roadCoords } = useRouteGeometry(route.lineCoords);
  const drawCoords = roadCoords ?? route.lineCoords;

  const distanceM = useMemo(() => sumMeters(drawCoords), [drawCoords]);
  const durationMin = distanceM / PACE_MPS / 60;

  const located = useMemo(() => plan.waypoints.filter(hasCoords), [plan.waypoints]);
  const selected = plan.waypoints.find((w) => w.id === selectedWaypointId);

  // Cumulative straight-line ETA to the selected waypoint.
  const selectedEta = useMemo(() => {
    if (!selected || !hasCoords(selected)) return undefined;
    const idx = located.findIndex((w) => w.id === selected.id);
    if (idx <= 0) return idx === 0 ? 0 : undefined;
    const seg = located.slice(0, idx + 1).map((w) => [w.lng, w.lat] as [number, number]);
    return sumMeters(seg) / PACE_MPS / 60;
  }, [selected, located]);

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startTranslate: number; lastT: number } | null>(null);
  const [snap, setSnap] = useState<Snap>("half");

  function onPointerDown(e: React.PointerEvent) {
    const el = sheetRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const start = snapTranslate(snap, window.innerHeight);
    dragRef.current = { startY: e.clientY, startTranslate: start, lastT: start };
    el.style.transition = "none";
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const vh = window.innerHeight;
    const t = Math.max(0, Math.min(vh * 0.92 - 80, d.startTranslate + (e.clientY - d.startY)));
    el.style.transform = `translateY(${t}px)`;
    d.lastT = t;
  }

  function onPointerUp() {
    const d = dragRef.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    dragRef.current = null;
    el.style.transition = "";
    el.style.transform = "";
    const vh = window.innerHeight;
    const positions: [Snap, number][] = [
      ["expanded", 0],
      ["half", vh * 0.42],
      ["collapsed", vh * 0.92 - COLLAPSED_PEEK],
    ];
    let best = positions[0];
    for (const p of positions) {
      if (Math.abs(p[1] - d.lastT) < Math.abs(best[1] - d.lastT)) best = p;
    }
    setSnap(best[0]);
  }

  const meta = selected ? PURPOSE_META[selected.purpose] : undefined;

  return (
    <aside
      ref={sheetRef}
      className={`route-sheet route-sheet--${snap}`}
      aria-label="Route details"
    >
      <div
        className="route-sheet__handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="route-sheet__grabber" aria-hidden="true" />
      </div>

      <header className="route-sheet__header">
        <h2 className="route-sheet__title h-display">{plan.title}</h2>
        <div className="route-sheet__stats">
          <span className="route-sheet__stat">
            <strong>{formatDistance(distanceM)}</strong>
            <span className="eyebrow">Distance</span>
          </span>
          <span className="route-sheet__stat">
            <strong>~{formatDuration(durationMin)}</strong>
            <span className="eyebrow">Est. time</span>
          </span>
          <span className="route-sheet__stat">
            <strong>{located.length}</strong>
            <span className="eyebrow">Waypoints</span>
          </span>
        </div>
      </header>

      <div className="route-sheet__actions">
        <button type="button" className="btn btn--primary" onClick={onStartRide}>
          ▶ Start
        </button>
        <button type="button" className="btn" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : savedId ? "Saved ✓" : "Save"}
        </button>
        {onShare && (
          <button type="button" className="btn btn--ghost" onClick={onShare}>
            Share
          </button>
        )}
      </div>

      <div className="route-sheet__body">
        {plan.summary && <p className="route-sheet__summary">{plan.summary}</p>}

        {selected && (
          <div className="route-sheet__deepdive">
            <div className="route-sheet__deepdive-head">
              <span
                className="route-sheet__dot"
                style={{ background: meta?.color }}
                aria-hidden="true"
              />
              <div>
                <strong className="route-sheet__deepdive-title">{selected.label}</strong>
                <span className="route-sheet__deepdive-meta">
                  {meta?.label}
                  {selectedEta !== undefined &&
                    (selectedEta > 0 ? ` · ~${formatDuration(selectedEta)} in` : " · at start")}
                </span>
              </div>
            </div>
            {selected.reason && (
              <div className="route-sheet__why">
                <span className="eyebrow">Why this spot</span>
                <p>{selected.reason}</p>
              </div>
            )}
          </div>
        )}

        {children}
      </div>
    </aside>
  );
}
