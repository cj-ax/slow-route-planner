interface ProgressRingProps {
  /** 0..1 */
  progress: number;
  size?: number;
  stroke?: number;
  trackColor?: string;
  arcColor?: string;
  label?: string;
  sublabel?: string;
}

/**
 * SVG progress ring. Prop-driven so it doubles as the heading/turn indicator
 * for a future AR-nav mode. Lime arc by default; pass an amber arcColor to
 * signal an off-route / attention state.
 */
export function ProgressRing({
  progress,
  size = 72,
  stroke = 6,
  trackColor = "var(--forest-700)",
  arcColor = "var(--lime-400)",
  label,
  sublabel,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  const center = size / 2;

  return (
    <div
      className="progress-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ? `${label} ${sublabel ?? ""}`.trim() : `${Math.round(clamped * 100)}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={arcColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      {(label || sublabel) && (
        <div className="progress-ring__center">
          {label && <span className="progress-ring__label">{label}</span>}
          {sublabel && <span className="progress-ring__sub">{sublabel}</span>}
        </div>
      )}
    </div>
  );
}
