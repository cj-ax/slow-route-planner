import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { RoutePlan } from "@srp/shared";
import { api } from "../api/client";
import { RideMode } from "../components/RideMode";
import { loadActiveRide } from "../ride/activeRide";

export function RidePage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    // No id (/ride) → ride the plan stashed by "Start Ride".
    if (!id) {
      const local = loadActiveRide();
      if (local) setPlan(local);
      else setError("No active ride yet — generate a route, then tap Start Ride.");
      setLoading(false);
      return;
    }

    api
      .getRoute(id)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch(() => {
        // Saved route didn't load (e.g. no Blob store on Vercel). Fall back to
        // the locally-stashed plan when it's the same route.
        const local = loadActiveRide();
        if (cancelled) return;
        if (local && local.id === id) setPlan(local);
        else
          setError(
            "Couldn't load this route. Saved routes need a Vercel Blob store to persist — or use Start Ride on a freshly generated route.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="ride-fallback">Loading ride…</div>;
  }

  if (error || !plan) {
    return (
      <div className="ride-fallback">
        <p>{error ?? "Couldn't load this route."}</p>
        <Link to="/" className="btn btn--ghost">
          ← Back to planner
        </Link>
      </div>
    );
  }

  return <RideMode plan={plan} />;
}
