/**
 * Format an ISO date string as the ISO 8601 calendar date
 * `YYYY-MM-DD`. The international standard — unambiguous in every
 * locale, sortable as a plain string, and the same form HTML
 * `<input type="date">` values use. Returns the raw input on
 * failure (invalid / unparseable dates).
 */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  // Build the YYYY-MM-DD form by hand to avoid locale-dependent
  // toLocaleDateString output (e.g. en-US flips to MM/DD/YYYY).
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Format an ISO date string as month + year only in ISO 8601 short
 * form `YYYY-MM`. Returns null for unparseable input — callers
 * typically render nothing in that case (vs. formatShortDate which
 * echoes the raw input so a malformed inline value doesn't
 * disappear silently).
 */
export function formatMonthYear(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

/**
 * Render a record's start/end date pair as a single time-period label
 * (the shared rule used by cert rows, project cards, and the project
 * detail page):
 *
 *   - both set    → "2026-01-01 – 2026-03-15"   (en dash)
 *   - only start  → "2026-01-01 (ongoing)"
 *   - only end    → "Until 2026-03-15"
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
