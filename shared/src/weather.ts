export type WeatherSeverity = "EXTREME" | "SEVERE" | "MODERATE" | "MINOR" | "UNKNOWN";

export interface WeatherAlert {
  title: string;
  severity: WeatherSeverity;
  urgency?: string;
  area?: string;
  eventType?: string;
  /** ISO timestamp when the alert expires. */
  expiresAt?: string;
}

export interface CurrentWeather {
  tempF: number;
  feelsLikeF?: number;
  /** Google weatherCondition.type enum (e.g. CLEAR, RAIN) for icon mapping. */
  conditionType?: string;
  /** Human-readable description, e.g. "Partly cloudy". */
  condition: string;
  humidityPct?: number;
  windMph?: number;
  windCardinal?: string;
  precipPct?: number;
  uvIndex?: number;
  isDaytime?: boolean;
}

export interface WeatherResponse {
  current: CurrentWeather | null;
  alerts: WeatherAlert[];
}
