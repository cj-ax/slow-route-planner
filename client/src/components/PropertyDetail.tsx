import { useEffect, useRef, useState } from "react";
import { DNR_HUNTING_RULES_URL, DNR_REGS_URL, type BaseLayerId, type OverlayId } from "../config";
import { AGENCIES, type Property } from "../lib/land";
import { formatMi } from "../lib/geo";
import { downloadTiles, planOfflineTiles } from "../lib/offline";

interface Props {
  p: Property;
  base: BaseLayerId;
  overlays: OverlayId[];
  logCount: number;
  onZoom: () => void;
  onBack: () => void;
}

const ACCESS_TEXT = { open: "Open (PAD-US)", restricted: "Restricted / permit (PAD-US)", unknown: "Unknown" };

export function PropertyDetail({ p, base, overlays, logCount, onZoom, onBack }: Props) {
  const bases: BaseLayerId[] = Array.from(new Set<BaseLayerId>([base, "topo", "imagery"]));
  const plan = planOfflineTiles(p.bbox, bases, overlays);
  const [dl, setDl] = useState<{ done: number; failed: number; running: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    abort.current = new AbortController();
    setDl({ done: 0, failed: 0, running: true });
    const r = await downloadTiles(plan.urls, (done, failed) => setDl({ done, failed, running: true }), abort.current.signal);
    setDl({ ...r, running: false });
  };

  const center = [(p.bbox[1] + p.bbox[3]) / 2, (p.bbox[0] + p.bbox[2]) / 2];
  const osmDirections = `https://www.openstreetmap.org/directions?to=${center[0].toFixed(5)}%2C${center[1].toFixed(5)}`;

  return (
    <div className="panel">
      <button className="link" onClick={onBack}>
        ‹ All properties
      </button>
      <h2>{p.name}</h2>
      <p>
        <span className="swatch" style={{ background: AGENCIES[p.agency].color }} /> {AGENCIES[p.agency].label} ·{" "}
        {p.state}
      </p>
      <dl className="facts">
        <dt>Size</dt>
        <dd>{p.acres.toLocaleString()} acres</dd>
        <dt>From Victoria</dt>
        <dd>{formatMi(p.distMi)} straight line</dd>
        <dt>DNR parking</dt>
        <dd>
          {p.parkingCount
            ? `${p.parkingCount} lot${p.parkingCount > 1 ? "s" : ""} on or near boundary`
            : "None in DNR data (check OSM/topo)"}
        </dd>
        <dt>Manager</dt>
        <dd>{p.manager || "n/a"}</dd>
        <dt>Public access</dt>
        <dd>{ACCESS_TEXT[p.access]}</dd>
        <dt>Deer hunting</dt>
        <dd>
          {p.hunting === "listed" ? <span className="badge badge--ok">listed by DNR</span> : <span className="badge">unknown</span>}{" "}
          {p.huntingNote}
        </dd>
        <dt>My logs</dt>
        <dd>{logCount}</dd>
        <dt>Source</dt>
        <dd>
          {p.sourceUrl ? (
            <a href={p.sourceUrl} target="_blank" rel="noreferrer">
              {p.source}
            </a>
          ) : (
            p.source
          )}
        </dd>
      </dl>
      <p className="small">
        <a href={DNR_HUNTING_RULES_URL} target="_blank" rel="noreferrer">
          MN DNR deer hunting
        </a>{" "}
        ·{" "}
        <a href={DNR_REGS_URL} target="_blank" rel="noreferrer">
          Regulations
        </a>{" "}
        ·{" "}
        <a href={osmDirections} target="_blank" rel="noreferrer">
          Directions (OSM)
        </a>
      </p>
      <div className="row">
        <button className="btn" onClick={onZoom}>
          Zoom to property
        </button>
        {!dl?.running ? (
          <button className="btn btn--accent" onClick={start} disabled={plan.tooBig}>
            {plan.tooBig ? "Too large to download" : `Download for offline (${plan.urls.length} tiles)`}
          </button>
        ) : (
          <button className="btn" onClick={() => abort.current?.abort()}>
            Cancel ({dl.done}/{plan.urls.length})
          </button>
        )}
      </div>
      {dl && !dl.running && (
        <p className="small">
          Offline: {dl.done} tiles saved{dl.failed ? `, ${dl.failed} failed (retry on better signal)` : ""}. Includes{" "}
          {bases.join(" + ")}
          {overlays.length ? ` + ${overlays.join(", ")}` : ""} at zoom 11 to 16.
        </p>
      )}
      {plan.tooBig && <p className="small muted">Zoom to a smaller unit, or turn off overlays, to reduce the tile count.</p>}
    </div>
  );
}
