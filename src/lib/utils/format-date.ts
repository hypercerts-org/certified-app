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
