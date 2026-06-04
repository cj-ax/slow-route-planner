import { useMemo } from "react";
import {
  mdiAlert,
  mdiWeatherCloudy,
  mdiWeatherFog,
  mdiWeatherLightning,
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWeatherRainy,
  mdiWeatherSnowy,
  mdiWeatherSunny,
  mdiWeatherWindy,
} from "@mdi/js";
import type { RoutePlan, WeatherAlert, WeatherSeverity } from "@srp/shared";
import { useWeather } from "../hooks/useWeather";
import { Icon } from "./Icon";

function centerOf(plan: RoutePlan): { lat: number; lng: number } | null {
  const pts = plan.waypoints.filter((w) => w.lat !== undefined && w.lng !== undefined);
  if (!pts.length) return null;
  return {
    lat: pts.reduce((s, w) => s + (w.lat as number), 0) / pts.length,
    lng: pts.reduce((s, w) => s + (w.lng as number), 0) / pts.length,
  };
}

function conditionIcon(type: string | undefined, isDaytime?: boolean): string {
  const t = (type ?? "").toUpperCase();
  if (/THUNDER|LIGHTNING|STORM/.test(t)) return mdiWeatherLightning;
  if (/RAIN|DRIZZLE|SHOWER/.test(t)) return mdiWeatherRainy;
  if (/SNOW|SLEET|FLURR|ICE|HAIL/.test(t)) return mdiWeatherSnowy;
  if (/FOG|MIST|HAZE|SMOKE/.test(t)) return mdiWeatherFog;
  if (/WIND/.test(t)) return mdiWeatherWindy;
  if (/PARTLY|MOSTLY_CLEAR|MOSTLY_SUNNY/.test(t)) return mdiWeatherPartlyCloudy;
  if (/CLOUD|OVERCAST/.test(t)) return mdiWeatherCloudy;
  if (/CLEAR|SUNNY|FAIR/.test(t)) return isDaytime === false ? mdiWeatherNight : mdiWeatherSunny;
  return mdiWeatherPartlyCloudy;
}

const SEVERITY_RANK: Record<WeatherSeverity, number> = {
  EXTREME: 4,
  SEVERE: 3,
  MODERATE: 2,
  MINOR: 1,
  UNKNOWN: 0,
};

function topAlert(alerts: WeatherAlert[]): WeatherAlert | undefined {
  return [...alerts].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
}

/** Floating weather summary + advisory banner over the map, for the route area. */
export function WeatherChip({ plan }: { plan: RoutePlan }) {
  const center = useMemo(() => centerOf(plan), [plan.waypoints]);
  const weather = useWeather(center?.lat, center?.lng);

  if (!weather) return null;
  const c = weather.current;
  const alert = topAlert(weather.alerts);
  if (!c && !alert) return null;

  return (
    <div className="weather">
      {c && (
        <div className="weather-chip" title={c.condition}>
          <Icon path={conditionIcon(c.conditionType, c.isDaytime)} size={20} />
          <span className="weather-chip__temp">{Math.round(c.tempF)}°</span>
          {c.precipPct !== undefined && c.precipPct > 0 && (
            <span className="weather-chip__sub">{Math.round(c.precipPct)}%</span>
          )}
        </div>
      )}
      {alert && (
        <div
          className={`weather-alert weather-alert--${alert.severity.toLowerCase()}`}
          title={`${alert.title}${alert.area ? ` — ${alert.area}` : ""}`}
        >
          <Icon path={mdiAlert} size={16} />
          <span className="weather-alert__title">{alert.title}</span>
        </div>
      )}
    </div>
  );
}
