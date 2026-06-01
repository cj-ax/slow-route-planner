import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { RoutePlan } from "@srp/shared";
import { api } from "../api/client";
import { RideMode } from "../components/RideMode";

export function RidePage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getRoute(id)
      .then(setPlan)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="ride-fallback">Loading ride…</div>;
  }

  if (error || !plan) {
    return (
      <div className="ride-fallback">
        <p>Couldn&apos;t load this route{error ? `: ${error}` : "."}</p>
        <Link to="/routes" className="btn btn--ghost">
          ← Saved routes
        </Link>
      </div>
    );
  }

  return <RideMode plan={plan} />;
}
