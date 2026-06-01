import { useCallback, useEffect, useState } from "react";
import type { RoutePlan } from "@srp/shared";
import { api } from "../api/client";

export interface UseSavedRoutes {
  routes: RoutePlan[];
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useSavedRoutes(): UseSavedRoutes {
  const [routes, setRoutes] = useState<RoutePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setRoutes(await api.listRoutes());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await api.deleteRoute(id);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { routes, loading, error, refresh, remove };
}
