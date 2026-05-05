/**
 * Chop seal — small red square stamp graphic with abstract characters.
 *
 * A purely decorative editorial detail that sits below the vertical
 * "Your identity, your choice." rail on the hero. Nods to traditional
 * publisher's marks; abstract glyphs (not real characters) so it reads
 * as ornament rather than language. Pure SVG, no images.
 */

export default function ChopSeal({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Certified mark"
      className="chop-seal"
    >
      {/* Outer red square */}
      <rect
        x="2"
        y="2"
        width="40"
        height="40"
        fill="var(--color-brand)"
        rx="1"
      />
      {/* Inner stamp area with thin border */}
      <rect
        x="5"
        y="5"
        width="34"
        height="34"
        fill="var(--color-brand)"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="0.6"
        rx="0.5"
      />
      {/* Abstract glyphs — 2x2 grid of cream marks. Designed to evoke
          a chop seal without being any specific real character. */}
      <g fill="var(--color-surface)" stroke="none">
        {/* top-left */}
        <rect x="9" y="9" width="6.5" height="1.4" />
        <rect x="9" y="11.6" width="2" height="6.4" />
        <rect x="13.5" y="11.6" width="2" height="6.4" />
        <rect x="9" y="16.6" width="6.5" height="1.4" />
        {/* top-right */}
        <rect x="22.5" y="9" width="1.4" height="9" />
        <rect x="25" y="9" width="6" height="1.4" />
        <rect x="25" y="13.5" width="6" height="1.4" />
        <rect x="29.6" y="14.9" width="1.4" height="3.1" />
        {/* bottom-left */}
        <rect x="9" y="22.5" width="6.5" height="1.4" />
        <rect x="11.5" y="23.9" width="1.5" height="7" />
        <rect x="9" y="29.5" width="6.5" height="1.4" />
        {/* bottom-right */}
        <rect x="22.5" y="22.5" width="8.5" height="1.4" />
        <rect x="25.5" y="23.9" width="2" height="7.1" />
        <rect x="22.5" y="29.5" width="8.5" height="1.4" />
      </g>
    </svg>
  );
}
