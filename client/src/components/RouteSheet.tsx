import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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

interface RouteSheetProps {
  plan: RoutePlan;
  selectedWaypointId?: string;
  onSelectWaypoint?: (id: string) => void;
  onPatch: (partial: Partial<RoutePlan>) => void;
  onStartRide: () => void;
  onSave: () => void;
  saving: boolean;
  savedId?: string;
  onShare?: () => void;
  /** Ride Mode link target shown once the route is saved. */
  rideHref?: string;
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

export function RouteSheet({
  plan,
  selectedWaypointId,
  onSelectWaypoint,
  onPatch,
  onStartRide,
  onSave,
  saving,
  savedId,
  onShare,
  rideHref,
}: RouteSheetProps) {
  const route = useMapRoute(plan);
  const { roadCoords } = useRouteGeometry(route.lineCoords);
  const drawCoords = roadCoords ?? route.lineCoords;

  const distanceM = useMemo(() => sumMeters(drawCoords), [drawCoords]);
  const durationMin = distanceM / PACE_MPS / 60;

  const located = useMemo(() => plan.waypoints.filter(hasCoords), [plan.waypoints]);
  const selected = plan.waypoints.find((w) => w.id === selectedWaypointId);

  const selectedEta = useMemo(() => {
    if (!selected || !hasCoords(selected)) return undefined;
    const idx = located.findIndex((w) => w.id === selected.id);
    if (idx <= 0) return idx === 0 ? 0 : undefined;
    const seg = located.slice(0, idx + 1).map((w) => [w.lng, w.lat] as [number, number]);
    return sumMeters(seg) / PACE_MPS / 60;
  }, [selected, located]);

  const sheetRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startT: number; lastT: number } | null>(null);
  const [snap, setSnap] = useState<Snap>("collapsed");
  const snapRef = useRef<Snap>("collapsed");
  snapRef.current = snap;

  const restingTranslate = (s: Snap): number => {
    const vh = window.innerHeight || 800;
    const headH = topRef.current?.offsetHeight ?? 210;
    if (s === "expanded") return 0;
    if (s === "half") return Math.round(vh * 0.45);
    return Math.max(0, Math.round(vh * 0.92 - headH)); // collapsed: only header visible
  };

  const applyResting = () => {
    const el = sheetRef.current;
    const top = topRef.current;
    if (!el) return;
    if (top) el.style.setProperty("--head-h", `${top.offsetHeight}px`);
    if (dragRef.current) return;
    el.style.transform = `translateY(${restingTranslate(snapRef.current)}px)`;
  };

  // Position the sheet whenever the snap changes.
  useLayoutEffect(() => {
    applyResting();
  }, [snap]);

  // Keep the collapsed peek correct as the header height / viewport changes.
  useEffect(() => {
    const top = topRef.current;
    const ro = top ? new ResizeObserver(applyResting) : null;
    if (top && ro) ro.observe(top);
    window.addEventListener("resize", applyResting);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", applyResting);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selecting a waypoint reveals its deep-dive — open the sheet if it's shut.
  useEffect(() => {
    if (selectedWaypointId) setSnap((s) => (s === "collapsed" ? "expanded" : s));
  }, [selectedWaypointId]);

  function onPointerDown(e: React.PointerEvent) {
    const el = sheetRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId); // capture on the handle, not the sheet
    el.style.transition = "none";
    const startT = restingTranslate(snapRef.current);
    dragRef.current = { startY: e.clientY, startT, lastT: startT };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const vh = window.innerHeight;
    const t = Math.max(0, Math.min(vh * 0.92 - 60, d.startT + (e.clientY - d.startY)));
    el.style.transform = `translateY(${t}px)`;
    d.lastT = t;
  }

  function onPointerUp() {
    const d = dragRef.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    dragRef.current = null;
    el.style.transition = ""; // restore the CSS transition
    let best: Snap = "collapsed";
    let bestDist = Infinity;
    for (const s of ["expanded", "half", "collapsed"] as Snap[]) {
      const dist = Math.abs(restingTranslate(s) - d.lastT);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    el.style.transform = `translateY(${restingTranslate(best)}px)`;
    setSnap(best);
  }

  const meta = selected ? PURPOSE_META[selected.purpose] : undefined;
  const startWp = plan.waypoints[0];
  const destWp =
    [...plan.waypoints].reverse().find((w) => w.purpose === "destination") ??
    plan.waypoints[plan.waypoints.length - 1];

  return (
    <aside ref={sheetRef} className={`route-sheet route-sheet--${snap}`} aria-label="Route details">
      <div ref={topRef} className="route-sheet__top">
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
          <input
            className="route-sheet__title h-display"
            value={plan.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            placeholder="Route title"
            aria-label="Route title"
          />
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
      </div>

      <div className="route-sheet__body">
        {selected && (
          <div className="route-sheet__deepdive">
            <div className="route-sheet__deepdive-head">
              <span className="route-sheet__dot" style={{ background: meta?.color }} aria-hidden="true" />
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

        {plan.summary && <p className="route-sheet__summary">{plan.summary}</p>}

        <div className="route-sheet__tags">
          {startWp && (
            <button type="button" className="map-badge" onClick={() => onSelectWaypoint?.(startWp.id)}>
              From: {plan.start}
            </button>
          )}
          {plan.destination && destWp && (
            <button type="button" className="map-badge" onClick={() => onSelectWaypoint?.(destWp.id)}>
              To: {plan.destination}
            </button>
          )}
          {plan.avoidRoads.map((a) => (
            <span key={a} className="chip chip--avoid">
              avoid: {a}
            </span>
          ))}
        </div>

        <label className="route-sheet__rating">
          <span className="eyebrow">Your rating</span>
          <div className="rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`rating__star${(plan.rating ?? 0) >= n ? " is-active" : ""}`}
                onClick={() => onPatch({ rating: plan.rating === n ? undefined : n })}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              >
                ★
              </button>
            ))}
          </div>
        </label>

        <label className="route-sheet__notes">
          <span className="eyebrow">Personal notes</span>
          <textarea
            className="field__input field__textarea"
            rows={3}
            value={plan.personalNotes ?? ""}
            onChange={(e) => onPatch({ personalNotes: e.target.value })}
            placeholder="Anything to remember about this ride…"
          />
        </label>

        {(plan.googleMapsUrl || (savedId && rideHref)) && (
          <div className="route-sheet__ctas">
            {plan.googleMapsUrl && (
              <a className="btn btn--ghost" href={plan.googleMapsUrl} target="_blank" rel="noreferrer">
                Open in Google Maps
              </a>
            )}
            {savedId && rideHref && (
              <Link className="btn btn--accent" to={rideHref}>
                Open Ride Mode →
              </Link>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
