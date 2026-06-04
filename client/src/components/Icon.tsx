/** Inline MDI icon (path data from @mdi/js), inherits currentColor. */
export function Icon({ path, size = 22 }: { path: string; size?: number }) {
  return (
    <svg className="mdi" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}
