/**
 * Formats a social-graph count (followers / following / endorsements) for
 * display. Returns an em dash for unknown values so an absent count reads as
 * "not loaded" rather than implying zero, and appends "+" when the underlying
 * list hit its display cap (e.g. the 10,000-follow ceiling).
 *
 * Shared by the desktop profile sidebar and the mobile profile header so both
 * surfaces render identical counts.
 */
export function formatGraphCount(
  n: number | null | undefined,
  truncated = false,
): string {
  if (n === null || n === undefined) return "—";
  const formatted = new Intl.NumberFormat().format(n);
  return truncated ? `${formatted}+` : formatted;
}
