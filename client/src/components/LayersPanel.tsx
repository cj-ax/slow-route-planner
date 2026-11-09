import { BASE_LAYERS, OVERLAYS, type BaseLayerId, type OverlayId } from "../config";
import { AGENCIES, type AgencyKey } from "../lib/land";
import type { OverlayState } from "../App";
import type { ScoutMeta } from "../lib/scout";
import { ScoutLayerControls, type ScoutLayerState } from "./Scout";
import { GOV_TYPES, type GovType } from "../lib/parcels";

interface Props {
  base: BaseLayerId;
  setBase: (b: BaseLayerId) => void;
  overlays: Record<OverlayId, OverlayState>;
  setOverlays: (f: (o: Record<OverlayId, OverlayState>) => Record<OverlayId, OverlayState>) => void;
  agencies: Record<AgencyKey, boolean>;
  setAgencies: (f: (a: Record<AgencyKey, boolean>) => Record<AgencyKey, boolean>) => void;
  onRefreshLand: () => void;
  meta: ScoutMeta | null;
  scoutLayers: ScoutLayerState;
  setScoutLayers: (f: (s: ScoutLayerState) => ScoutLayerState) => void;
  parcelsOn: boolean;
  setParcelsOn: (on: boolean) => void;
  govTypes: Record<GovType, boolean>;
  setGovTypes: (f: (g: Record<GovType, boolean>) => Record<GovType, boolean>) => void;
}

export function LayersPanel({ base, setBase, overlays, setOverlays, agencies, setAgencies, onRefreshLand, meta, scoutLayers, setScoutLayers, parcelsOn, setParcelsOn, govTypes, setGovTypes }: Props) {
  return (
    <div className="panel">
      <h2>Habitat model</h2>
      <ScoutLayerControls meta={meta} state={scoutLayers} setState={setScoutLayers} />

      <h2>Base map</h2>
      <div className="seg">
        {Object.values(BASE_LAYERS).map((b) => (
          <button key={b.id} className={base === b.id ? "on" : ""} onClick={() => setBase(b.id as BaseLayerId)}>
            {b.label}
          </button>
        ))}
      </div>

      <h2>Overlays</h2>
      {Object.values(OVERLAYS).map((o) => {
        const st = overlays[o.id as OverlayId];
        return (
          <div key={o.id} className="overlay-row">
            <label className="check">
              <input
                type="checkbox"
                checked={st.on}
                onChange={(e) => setOverlays((cur) => ({ ...cur, [o.id]: { ...cur[o.id as OverlayId], on: e.target.checked } }))}
              />
              <span>{o.label}</span>
            </label>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={st.opacity}
              aria-label={`${o.label} opacity`}
              disabled={!st.on}
              onChange={(e) =>
                setOverlays((cur) => ({ ...cur, [o.id]: { ...cur[o.id as OverlayId], opacity: +e.target.value } }))
              }
            />
            {o.legend && st.on && <small className="legend">{o.legend}</small>}
          </div>
        );
      })}

      <h2>Public land</h2>
      <div className="agency-grid">
        {(Object.keys(AGENCIES) as AgencyKey[]).map((k) => (
          <label key={k} className="check">
            <input type="checkbox" checked={agencies[k]} onChange={(e) => setAgencies((a) => ({ ...a, [k]: e.target.checked }))} />
            <span className="swatch" style={{ background: AGENCIES[k].color }} />
            <span>{AGENCIES[k].label}</span>
          </label>
        ))}
      </div>
      <h2>Government-owned land (MN county data)</h2>
      <div className="agency-grid">
        {(Object.keys(GOV_TYPES) as GovType[]).map((k) => (
          <label key={k} className="check">
            <input type="checkbox" checked={govTypes[k]} onChange={(e) => setGovTypes((g) => ({ ...g, [k]: e.target.checked }))} />
            <span className="swatch" style={{ background: GOV_TYPES[k].color }} />
            <span>{GOV_TYPES[k].label}</span>
          </label>
        ))}
      </div>
      <p className="muted small">
        Shown from zoom 11. Fills gaps PAD-US misses, especially county tax-forfeit land. Ownership is not permission to hunt:
        tap a parcel for notes and verify with the county.
      </p>
      <label className="check">
        <input type="checkbox" checked={parcelsOn} onChange={(e) => setParcelsOn(e.target.checked)} />
        <span className="swatch" style={{ background: "repeating-linear-gradient(90deg,#3d3d3d 0 4px,transparent 4px 6px)" }} />
        <span>Parcel lines (MN, zoom in to see)</span>
      </label>
      <p className="muted small">
        Parcel lines come from county records via MnGeo. Context only, not survey-grade, and they never imply permission to
        hunt or cross private land.
      </p>
      <p className="muted">
        Sources: USGS PAD-US and MN DNR WMA boundaries, fetched live and cached on this device for 7 days. Blue dots are
        DNR WMA parking lots. County tax-forfeit land is only shown where PAD-US includes it.
      </p>
      <button className="btn" onClick={onRefreshLand}>
        Refresh public land now
      </button>
    </div>
  );
}
