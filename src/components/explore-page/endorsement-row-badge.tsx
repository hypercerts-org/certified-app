"use client"

import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"

const DEGREE_LABEL: Record<1 | 2 | 3, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
}

/**
 * Static degree pill — "1st" / "2nd" / "3rd" coloured by tier. No
 * interactivity; the via predecessor list is intentionally hidden.
 */
export default function EndorsementRowBadge({
  meta,
}: {
  meta: EndorsementClosureAccount
}) {
  return (
    <span
      className={`endorsement-row-badge__degree endorsement-row-badge__degree--d${meta.degree}`}
      title={`Reachable at degree ${meta.degree} through your endorsement graph.`}
    >
      {DEGREE_LABEL[meta.degree]}
    </span>
  )
}
