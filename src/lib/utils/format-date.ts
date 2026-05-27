/**
 * Format an ISO date string as a short internationally-readable date,
 * e.g. "5 Jan 2025". Day-Month-Year order is the convention used in
 * most of the world outside the US (en-GB / ISO-aligned reading order)
 * and the short month name keeps it ambiguity-free without dropping
 * into the dense `2025-01-05` ISO 8601 numeric form that reads as a
 * timestamp rather than a calendar date. Returns the raw input on
 * failure (invalid / unparseable dates).
 */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
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
