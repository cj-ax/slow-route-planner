import { useEffect, useState } from "react";
import type { HealthStatus } from "@srp/shared";
import { api } from "../api/client";
import { mapStyleConfigured } from "../map/style";
import {
  DEFAULT_OFF_ROUTE_THRESHOLD_M,
  DEFAULT_WAYPOINT_REACHED_M,
  loadRideConfig,
  saveRideConfig,
  type RideConfig,
} from "../config/ride";

function StatusRow({ label, ok, okText, offText }: { label: string; ok: boolean; okText?: string; offText?: string }) {
  return (
    <div className="status-row">
      <span className="status-row__label">{label}</span>
      <span className={`status-pill ${ok ? "status-pill--on" : "status-pill--off"}`}>
        {ok ? okText ?? "Configured" : offText ?? "Not configured"}
      </span>
    </div>
  );
}

export function SettingsPage() {
  const [health, setHealth] = useState<HealthStatus>();
  const [failed, setFailed] = useState(false);
  const [config, setConfig] = useState<RideConfig>(() => loadRideConfig());

  useEffect(() => {
    api.health().then(setHealth).catch(() => setFailed(true));
  }, []);

  function update(partial: Partial<RideConfig>) {
    const next = { ...config, ...partial };
    setConfig(next);
    saveRideConfig(next);
  }

  return (
    <div className="page settings-page">
      <header className="page__header">
        <h2>Settings</h2>
        <p className="muted">
          Status only — secrets live in environment variables and are never shown here.
        </p>
      </header>

      <section className="panel">
        <h3>Service status</h3>
        {failed && <p className="muted">Couldn&apos;t reach the API server.</p>}
        {health && (
          <div className="status-list">
            <StatusRow label="LLM (route generation)" ok={health.llmConfigured} />
            <StatusRow label="Google Places (search)" ok={health.placesConfigured} />
            <StatusRow
              label="Routing (road geometry)"
              ok={health.routingConfigured}
              okText="OpenRouteService"
              offText="Straight lines"
            />
            <StatusRow label="Custom map style" ok={mapStyleConfigured} okText="Custom vector" offText="Dark raster fallback" />
            <StatusRow
              label="Mode"
              ok={!health.mockMode}
              okText="Live"
              offText="Mock data"
            />
            <StatusRow
              label="Storage backend"
              ok={health.storageBackend === "vercel-blob"}
              okText="Vercel Blob"
              offText="Local JSON file"
            />
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Ride thresholds</h3>
        <p className="muted">Tune how Ride Mode tracks your position. Saved to this device.</p>
        <label className="field">
          <span className="field__label">
            Off-route warning distance (m) — default {DEFAULT_OFF_ROUTE_THRESHOLD_M}
          </span>
          <input
            className="field__input"
            type="number"
            min={20}
            max={1000}
            value={config.offRouteThresholdM}
            onChange={(e) => update({ offRouteThresholdM: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span className="field__label">
            Waypoint reached distance (m) — default {DEFAULT_WAYPOINT_REACHED_M}
          </span>
          <input
            className="field__input"
            type="number"
            min={15}
            max={500}
            value={config.waypointReachedM}
            onChange={(e) => update({ waypointReachedM: Number(e.target.value) })}
          />
        </label>
      </section>
    </div>
  );
}
