/**
 * SealArt — the landing page's signature artwork: a certification seal
 * drawn as a technical line drawing. Concentric dashed rings (records
 * accumulating), short dark "signature" arcs with notary dots
 * (endorsements), and a perforated stamp rim.
 *
 * Pure server-rendered inline SVG. All geometry is generated
 * deterministically from the ring index so the markup is stable across
 * renders. Strokes use currentColor inside a wrapper that sets
 * `color: var(--color-navy)`, so the whole drawing flips with the
 * theme for free; opacity tiers (0.14 / 0.28 / 0.5 / 0.9) carry the
 * depth. Rotation is CSS-only (`.lp-seal--animate`) and is neutralized
 * by the global reduced-motion kill-switch in tokens.css.
 */

const CX = 400;
const CY = 400;

interface SealArtProps {
  /** Number of concentric rings (default 10 — the full hero seal). */
  rings?: number;
  /** Render the dark signature arcs + notary dots (default true). */
  accents?: boolean;
  /** Slow CSS rotation of the dashed rings (default true). */
  animate?: boolean;
  className?: string;
}

/** Point on the ring at `deg` degrees (0° = 3 o'clock, clockwise). */
function pt(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** Arc path of `sweep` degrees starting at `startDeg` on radius `r`. */
function arcPath(r: number, startDeg: number, sweep: number): string {
  const [x1, y1] = pt(r, startDeg);
  const [x2, y2] = pt(r, startDeg + sweep);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function SealArt({
  rings = 10,
  accents = true,
  animate = true,
  className = "",
}: SealArtProps) {
  const ringIdx = Array.from({ length: rings }, (_, i) => i);
  // Signature arcs live on every third ring, counted from the second.
  const accentRings = ringIdx.filter((i) => i % 3 === 2);
  const rimRadius = 64 + rings * 32;
  const ticks = Array.from({ length: 72 }, (_, j) => j * 5);

  return (
    <div className={`lp-seal ${animate ? "lp-seal--animate" : ""} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Core: the account at the center */}
        <circle cx={CX} cy={CY} r={36} stroke="currentColor" strokeWidth={1.25} opacity={0.9} />
        <circle cx={CX} cy={CY} r={28} stroke="currentColor" strokeWidth={0.75} opacity={0.5} vectorEffect="non-scaling-stroke" />
        <circle cx={CX} cy={CY} r={3} fill="currentColor" opacity={0.9} />

        {/* Dashed rings — segment counts grow denser outward */}
        {ringIdx.map((i) => {
          const r = 64 + i * 32;
          const segments = 8 + i * 3;
          const period = 100 / segments;
          return (
            <circle
              key={i}
              className="lp-seal__ring"
              cx={CX}
              cy={CY}
              r={r}
              pathLength={100}
              stroke="currentColor"
              strokeWidth={0.75}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={`${(period * 0.72).toFixed(3)} ${(period * 0.28).toFixed(3)}`}
              opacity={0.14 + (i % 3) * 0.07}
              style={{
                animationDuration: `${90 + i * 25}s`,
                animationDirection: i % 2 === 1 ? "reverse" : "normal",
              }}
            />
          );
        })}

        {/* Signature arcs + notary dots — endorsements on the record */}
        {accents && (
          <g className="lp-seal__accents">
            {accentRings.map((i) => {
              const r = 64 + i * 32;
              return [0, 1, 2].map((k) => {
                const start = 20 + k * 120 + i * 17;
                const sweep = 14 + ((i + k) % 3) * 7;
                const [dx, dy] = pt(r, start);
                return (
                  <g key={`${i}-${k}`}>
                    <path d={arcPath(r, start, sweep)} stroke="currentColor" strokeWidth={1.25} opacity={0.9} strokeLinecap="round" />
                    <circle cx={dx} cy={dy} r={2.5} fill="currentColor" opacity={0.9} />
                  </g>
                );
              });
            })}
          </g>
        )}

        {/* Perforated stamp rim */}
        <g opacity={0.3}>
          {ticks.map((deg) => {
            const [x1, y1] = pt(rimRadius, deg);
            const [x2, y2] = pt(rimRadius + 7, deg);
            return (
              <line
                key={deg}
                x1={x1.toFixed(2)}
                y1={y1.toFixed(2)}
                x2={x2.toFixed(2)}
                y2={y2.toFixed(2)}
                stroke="currentColor"
                strokeWidth={0.75}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
