/**
 * Format a notification / pending-count value for a nav badge chip.
 *
 * Consolidates the duplicate formatters in bottom-nav, desktop-left-rail
 * (formatUnreadBadge + formatPendingBadge), and mobile-sidebar. Semantics
 * preserved exactly:
 *   - `null`  for counts <= 0 (badge hidden)
 *   - the number, as a string, for 1..98
 *   - `"99+"` when the count is >= 99, or when `more` is true (the caller
 *     knows there are additional items beyond what was counted)
 *
 * Note: callers that gate on a loading/ready flag (e.g. `ready ? … : null`)
 * or a nullable count should keep doing so before calling this — it only
 * formats a known numeric count.
 *
 * @param count The unread / pending count.
 * @param more  True if there are more items than `count` represents.
 * @returns The badge label, or `null` when no badge should render.
 */
export function formatCountBadge(count: number, more = false): string | null {
  if (count <= 0) return null
  if (more || count >= 99) return "99+"
  return String(count)
}
