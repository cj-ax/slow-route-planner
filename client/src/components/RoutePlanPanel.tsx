import { Link } from "react-router-dom";
import type { RoutePlan } from "@srp/shared";

interface RoutePlanPanelProps {
  plan: RoutePlan;
  onPatch: (partial: Partial<RoutePlan>) => void;
  onSave: () => void;
  saving: boolean;
  savedId?: string;
  onSelectWaypoint?: (id: string) => void;
}

export function RoutePlanPanel({
  plan,
  onPatch,
  onSave,
  saving,
  savedId,
  onSelectWaypoint,
}: RoutePlanPanelProps) {
  const startWp = plan.waypoints[0];
  const destWp =
    [...plan.waypoints].reverse().find((w) => w.purpose === "destination") ??
    plan.waypoints[plan.waypoints.length - 1];

  return (
    <section className="panel route-plan-panel">
      <input
        className="route-plan-panel__title"
        value={plan.title}
        onChange={(e) => onPatch({ title: e.target.value })}
        placeholder="Route title"
      />
      <p className="route-plan-panel__summary">{plan.summary}</p>
      <div className="route-plan-panel__od">
        <button
          type="button"
          className="map-badge"
          onClick={() => startWp && onSelectWaypoint?.(startWp.id)}
        >
          From: {plan.start}
        </button>
        {plan.destination && (
          <button
            type="button"
            className="map-badge"
            onClick={() => destWp && onSelectWaypoint?.(destWp.id)}
          >
            To: {plan.destination}
          </button>
        )}
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field__label">Your rating</span>
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
      </div>

      <label className="field">
        <span className="field__label">Personal notes</span>
        <textarea
          className="field__input field__textarea"
          rows={2}
          value={plan.personalNotes ?? ""}
          onChange={(e) => onPatch({ personalNotes: e.target.value })}
          placeholder="Anything to remember about this ride…"
        />
      </label>

      <div className="route-plan-panel__actions">
        <button type="button" className="btn btn--primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : savedId ? "Update saved route" : "Save route"}
        </button>
        {plan.googleMapsUrl && (
          <a
            className="btn btn--ghost"
            href={plan.googleMapsUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google Maps
          </a>
        )}
        {savedId && (
          <Link className="btn btn--accent" to={`/routes/${savedId}/ride`}>
            Open Ride Mode →
          </Link>
        )}
      </div>
      {savedId && <p className="muted route-plan-panel__saved">Saved ✓</p>}
    </section>
  );
}
