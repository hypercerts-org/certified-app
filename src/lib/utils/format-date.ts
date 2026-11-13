/**
 * Dates, one rule everywhere (DESIGN.md §3.4):
 *
 *   - an absolute date is "13 Nov 2026" (day, short English month, year;
 *     never ISO "2026-11-13", which reads as code beside words, and never
 *     locale-dependent);
 *   - when something happened (a post, an endorsement, a record created)
 *     is relative up to 7 days ("just now", "5m ago", "3h ago", "2d ago"),
 *     then the absolute date (`formatRelativeDate`);
 *   - set in the surrounding face with tabular figures, never mono.
 *
 * All in UTC, so a date reads the same for everyone and on the server.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "13 Nov 2026". Returns the raw input when it can't be parsed, so a
 *  malformed value stays visible instead of vanishing. */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** "Nov 2026", for month precision (an account's start, a founding date).
 *  Null when it can't be parsed. */
export function formatMonthYear(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * When something happened: "just now", "5m ago", "3h ago", "2d ago" up to
 * 7 days, then "13 Nov 2026". Empty for an unparseable date. `now` is for
 * tests.
 */
export function formatRelativeDate(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diffMs = Math.max(0, now - then)
  const minutes = Math.floor(diffMs / 60_000)
  const hours = Math.floor(diffMs / 3_600_000)
  const days = Math.floor(diffMs / 86_400_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatShortDate(iso)
}

/**
 * Render a record's start/end date pair as a single time-period label
 * (the shared rule used by cert rows, project cards, and the project
 * detail page):
 *
 *   - both set    → "1 Jan 2026 – 15 Mar 2026"   (en dash)
 *   - only start  → "1 Jan 2026 (ongoing)"
 *   - only end    → "Until 15 Mar 2026"
 *   - neither     → null (caller skips the row)
 */
export function formatTimePeriod(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null
  const s = start ? formatShortDate(start) : null
  const e = end ? formatShortDate(end) : null
  if (s && e) return `${s} – ${e}`
  if (s) return `${s} (ongoing)`
  if (e) return `Until ${e}`
  return null
}
