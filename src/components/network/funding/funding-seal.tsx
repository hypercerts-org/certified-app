import {
  BUCKET_BOTH,
  BUCKET_OTHER,
  BUCKET_RECIPIENT,
  BUCKET_SENDER,
  BUCKET_TRUSTED,
} from "@/lib/funding/dataset-types"

/**
 * The "split seal": one mark that says who vouches for a receipt.
 *
 *   outer ring    a trusted source recorded it (dashed: another publisher)
 *   left half     the funder published a receipt
 *   right half    the recipient published a receipt
 *   full disc     both sides did (drawn in the success colour)
 *
 * A trusted source's receipt has an empty centre that fills from the right
 * when the recipient confirms it. Decorative: always sits next to a word.
 */
export default function FundingSeal({
  bits,
  size = 16,
  className = "",
}: {
  bits: number
  size?: number
  className?: string
}) {
  const trusted = !!(bits & BUCKET_TRUSTED)
  const other = !trusted && !!(bits & BUCKET_OTHER)
  const both = !!(bits & BUCKET_BOTH)
  const left = both || !!(bits & BUCKET_SENDER)
  const right = both || !!(bits & BUCKET_RECIPIENT)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`funding-seal${both ? " funding-seal--both" : ""} ${className}`.trim()}
    >
      {trusted ? <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" /> : null}
      {other ? (
        <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 2" />
      ) : null}
      {both ? (
        <circle cx="10" cy="10" r={trusted || other ? 5.6 : 7} fill="currentColor" />
      ) : (
        <>
          {trusted || other || left || right ? (
            <circle
              cx="10"
              cy="10"
              r={trusted || other ? 5.6 : 7}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
            />
          ) : null}
          {left ? <path d={halfDisc(trusted || other ? 5.6 : 7, "left")} fill="currentColor" /> : null}
          {right ? <path d={halfDisc(trusted || other ? 5.6 : 7, "right")} fill="currentColor" /> : null}
        </>
      )}
    </svg>
  )
}

function halfDisc(r: number, side: "left" | "right"): string {
  // From the top of the circle, around the chosen side, to the bottom.
  const sweep = side === "right" ? 1 : 0
  return `M10 ${10 - r} A${r} ${r} 0 0 ${sweep} 10 ${10 + r} Z`
}
