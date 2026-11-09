import type { Season } from "../lib/logs";
import type { WindDir } from "../lib/wind";
import {
  FACTOR_LABELS,
  seasonScore,
  windFit,
  windMessage,
  type CandidateProps,
  type PointBreakdown,
  type ScoutMeta,
} from "../lib/scout";

export interface ScoutLayerState {
  heat: boolean;
  heatOpacity: number;
  corridors: boolean;
  stands: boolean;
  bedding: boolean;
  funnels: boolean;
}

export const DEFAULT_SCOUT_LAYERS: ScoutLayerState = {
  heat: true,
  heatOpacity: 0.75,
  corridors: false,
  stands: true,
  bedding: true,
  funnels: true,
};

export function ScoutLayerControls({
  meta,
  state,
  setState,
}: {
  meta: ScoutMeta | null;
  state: ScoutLayerState;
  setState: (f: (s: ScoutLayerState) => ScoutLayerState) => void;
}) {
  if (!meta)
    return (
      <p className="muted small">
        Habitat model not published yet. Run the <code>pipeline</code> workflow to add heat maps and stand candidates.
      </p>
    );
  const t = (k: keyof ScoutLayerState, label: string, extra?: string) => (
    <label className="check">
      <input type="checkbox" checked={!!state[k]} onChange={(e) => setState((s) => ({ ...s, [k]: e.target.checked }))} />
      {extra && <span className="swatch" style={{ background: extra }} />}
      <span>{label}</span>
    </label>
  );
  return (
    <>
      <div className="overlay-row">
        {t("heat", "Deer activity heat map")}
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={state.heatOpacity}
          aria-label="Heat map opacity"
          disabled={!state.heat}
          onChange={(e) => setState((s) => ({ ...s, heatOpacity: +e.target.value }))}
        />
        <small className="legend">
          <span className="heat-ramp" /> low → high for the selected season, inside public land only
        </small>
      </div>
      <div className="agency-grid">
        {t("corridors", "Modeled travel corridors", "#7a1ea0")}
        {t("stands", "Stand candidates (green good wind, red bad)", "#2f9e44")}
        {t("bedding", "Bedding candidates", "#8d5524")}
        {t("funnels", "Funnel / pinch candidates", "#7a1ea0")}
      </div>
      <p className="muted small">
        Model run {meta.generated.slice(0, 10)} · {meta.counts.properties} properties · ~{meta.groundResolutionM} m cells
      </p>
    </>
  );
}

export function PointCard({
  info,
  meta,
  season,
  onClose,
}: {
  info: { loading: boolean; b: PointBreakdown | null };
  meta: ScoutMeta;
  season: Season;
  onClose: () => void;
}) {
  const s = meta.seasons[season];
  return (
    <div className="point-card" role="dialog" aria-label="Score breakdown">
      <button className="point-card__close" onClick={onClose} aria-label="Close breakdown">
        ✕
      </button>
      {info.loading ? (
        <p className="small">Loading…</p>
      ) : !info.b ? (
        <p className="small">No model data here. Only public land plus a 500 m buffer is scored.</p>
      ) : (
        (() => {
          const { total, parts } = seasonScore(info.b, s);
          return (
            <>
              <strong>
                {s.label}: {Math.round(total * 100)}
                <span className="muted small"> /100 {info.b.inProperty ? "" : "(buffer, not public land)"}</span>
              </strong>
              <ul className="bars">
                {parts
                  .slice()
                  .sort((a, b) => b.contrib - a.contrib)
                  .map((p) => (
                    <li key={p.key}>
                      <span>{FACTOR_LABELS[p.key]}</span>
                      <span className="bar">
                        <span style={{ width: `${Math.round(p.value * 100)}%` }} />
                      </span>
                      <span className="small">
                        {Math.round(p.value * 100)} × {Math.round(p.weight * 100)}%
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="small muted">
                Walk from parking: {info.b.accessMinutes === null ? "unknown" : `~${info.b.accessMinutes} min`}
              </p>
            </>
          );
        })()
      )}
    </div>
  );
}

export function CandidateDetail({ c, wind, onProperty }: { c: CandidateProps; wind: WindDir | ""; onProperty: () => void }) {
  const fit = windFit(c.wind, wind);
  const title = c.kind === "stand" ? "Stand candidate" : c.kind === "bedding" ? "Likely bedding" : "Funnel / pinch point";
  return (
    <div className="panel">
      <h2>
        {title} <small className="muted">score {c.score}</small>
      </h2>
      <button className="link" onClick={onProperty}>
        {c.pname} ›
      </button>
      <h3>Why here</h3>
      <ul>
        {c.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {c.kind === "stand" && (
        <>
          <h3>Wind</h3>
          <p className={`wind wind--${fit}`}>{windMessage(c, wind)}</p>
          {c.wind && c.wind.badWinds.length > 0 && <p className="small">Avoid: {c.wind.badWinds.join(", ")}</p>}
          {c.entry && (
            <>
              <h3>Entry</h3>
              <p className="small">
                Nearest parking is to the {c.entry.fromDir}
                {c.entry.walkMin !== null ? `, about ${Math.round(c.entry.walkMin)} min walk` : ""}.
                {c.entry.crossesDeerSide
                  ? " The direct route crosses the deer side, so enter early, loop around, or use the wind to keep scent off the bedding."
                  : " The direct route stays off the deer approach side."}{" "}
                Enter and sit on the same good winds.
              </p>
            </>
          )}
        </>
      )}
      <p className="muted small">
        Model output from public data. A scouting aid to check on the ground, not a prediction of deer or success.
      </p>
    </div>
  );
}
