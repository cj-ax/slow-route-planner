import { useCallback, useState } from "react";
import { buildGoogleMapsUrl, type RoutePlan, type RouteRequest } from "@srp/shared";
import { api } from "../api/client";

/** Recompute the Google Maps URL whenever the plan changes. */
function withGoogleUrl(plan: RoutePlan): RoutePlan {
  return { ...plan, googleMapsUrl: buildGoogleMapsUrl(plan) };
}

export interface UseRoutePlan {
  plan: RoutePlan | null;
  loading: boolean;
  error?: string;
  generate: (request: RouteRequest) => Promise<void>;
  setPlan: (plan: RoutePlan | null) => void;
  updatePlan: (updater: (plan: RoutePlan) => RoutePlan) => void;
}

export function useRoutePlan(initial: RoutePlan | null = null): UseRoutePlan {
  const [plan, setPlanState] = useState<RoutePlan | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const setPlan = useCallback((next: RoutePlan | null) => {
    setPlanState(next ? withGoogleUrl(next) : null);
  }, []);

  const updatePlan = useCallback((updater: (plan: RoutePlan) => RoutePlan) => {
    setPlanState((current) => (current ? withGoogleUrl(updater(current)) : current));
  }, []);

  const generate = useCallback(async (request: RouteRequest) => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await api.generatePlan(request);
      setPlanState(withGoogleUrl(result));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { plan, loading, error, generate, setPlan, updatePlan };
}
