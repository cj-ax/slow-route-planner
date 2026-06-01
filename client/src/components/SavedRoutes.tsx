import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RoutePlan } from "@srp/shared";

function endpointType(plan: RoutePlan): string | undefined {
  const selected = plan.foodDrinkOptions?.find((o) => o.selected);
  return (selected ?? plan.foodDrinkOptions?.[0])?.type;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

interface SavedRoutesProps {
  routes: RoutePlan[];
  loading: boolean;
  onDelete: (id: string) => void;
}

export function SavedRoutes({ routes, loading, onDelete }: SavedRoutesProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter((r) =>
      [r.title, r.destination, r.summary, r.start]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [routes, query]);

  return (
    <div className="saved-routes">
      <input
        className="field__input saved-routes__search"
        placeholder="Search by title or area…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading && <p className="muted">Loading…</p>}
      {!loading && routes.length === 0 && (
        <p className="muted">
          No saved routes yet. <Link to="/">Plan one →</Link>
        </p>
      )}
      {!loading && routes.length > 0 && filtered.length === 0 && (
        <p className="muted">Nothing matches “{query}”.</p>
      )}

      <ul className="saved-routes__list">
        {filtered.map((route) => {
          const type = endpointType(route);
          return (
            <li key={route.id} className="saved-card panel">
              <div className="saved-card__main">
                <h3 className="saved-card__title">{route.title}</h3>
                <p className="saved-card__summary">{route.summary}</p>
                <div className="saved-card__meta">
                  {route.destination && <span className="pill">→ {route.destination}</span>}
                  <span className="pill">{route.waypoints.length} waypoints</span>
                  {type && <span className="chip chip--prefer">{type.replace("_", " ")}</span>}
                  {route.rating ? (
                    <span className="saved-card__rating">{"★".repeat(route.rating)}</span>
                  ) : null}
                  {route.createdAt && (
                    <span className="muted">{formatDate(route.createdAt)}</span>
                  )}
                </div>
              </div>
              <div className="saved-card__actions">
                <Link className="btn btn--ghost btn--sm" to={`/routes/${route.id}`}>
                  Open
                </Link>
                <Link className="btn btn--accent btn--sm" to={`/routes/${route.id}/ride`}>
                  Ride
                </Link>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => route.id && onDelete(route.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
