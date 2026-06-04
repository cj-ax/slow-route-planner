import { useEffect, useState } from "react";
import type { WeatherResponse } from "@srp/shared";
import { api } from "../api/client";

/**
 * Fetch current weather + alerts for a point. Coordinates are rounded to ~1km
 * so tiny route shifts don't refetch (the server caches on top of that).
 */
export function useWeather(lat?: number, lng?: number): WeatherResponse | null {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const rlat = lat !== undefined ? Math.round(lat * 100) / 100 : undefined;
  const rlng = lng !== undefined ? Math.round(lng * 100) / 100 : undefined;

  useEffect(() => {
    if (rlat === undefined || rlng === undefined) return;
    let cancelled = false;
    api
      .weather(rlat, rlng)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rlat, rlng]);

  return data;
}
