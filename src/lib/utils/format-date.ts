/**
 * Format an ISO date string as a short US-English date, e.g. "Jan 5, 2025".
 * Returns the raw input on failure (invalid / unparseable dates).
 */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Format an ISO date string as month + year only, e.g. "Jan 2025".
 * Returns null for unparseable input — callers typically render nothing
 * in that case (vs. formatShortDate which echoes the raw input so a
 * malformed inline value doesn't disappear silently).
 */
export function formatMonthYear(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  })
}
