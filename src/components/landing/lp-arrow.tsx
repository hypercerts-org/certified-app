/**
 * The ↗ glyph used on every outbound / drill-in link on the landing
 * page. Decorative — callers carry the accessible label.
 */
export default function LpArrow({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`lp-arrow ${className}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 13 L13 3 M5 3 H13 V11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}
