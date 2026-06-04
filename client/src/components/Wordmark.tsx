/**
 * The Meander wordmark — Grand Hotel retro script (the brand's signature voice),
 * with the optional decorative "meander swash" (Arches variant) underneath,
 * ending in an amber milestone dot. Wordmark-only; no pictorial mark.
 */
export function Wordmark({
  size = 26,
  swash = false,
}: {
  size?: number;
  swash?: boolean;
}) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <span className="wordmark__text">Meander</span>
      {swash && (
        <svg
          className="wordmark__swash"
          width={size * 2.6}
          height={size * 0.56}
          viewBox="0 0 130 28"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8,17 C16,3 30,3 38,16 C44,25 54,25 62,16 C70,3 86,3 96,16 C101,22 108,22 116,14"
            stroke="currentColor"
            strokeWidth="4.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="116" cy="14" r="4.2" fill="var(--amber-500)" />
        </svg>
      )}
    </span>
  );
}
