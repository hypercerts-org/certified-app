/**
 * Small display formatters shared by the explore funding rows and
 * detail modal. Kept here (rather than in lib/utils) because only the
 * explore-page surfaces use them today.
 */

/**
 * Localized absolute date + time for a `<time title>` hover tooltip
 * (e.g. "Oct 22, 2026, 2:03 PM"), instead of the raw ISO string.
 * Returns the input unchanged when it can't be parsed.
 */
export function formatAbsoluteDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

/**
 * Group the digits of a decimal amount string ("12345678.9" ->
 * "12,345,678.9") without converting it to a float, so large or
 * high-precision amounts keep every digit. The integer part goes through
 * Intl.NumberFormat as a BigInt; the fraction is appended as written
 * (with the locale's decimal separator). Anything that isn't a plain
 * decimal number is returned unchanged.
 */
export function formatAmount(raw: string): string {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw.trim())
  if (!m) return raw
  const [, sign, int, frac] = m
  const nf = new Intl.NumberFormat()
  const grouped = nf.format(BigInt(int))
  if (!frac) return `${sign}${grouped}`
  const decimal =
    nf.formatToParts(1.1).find((p) => p.type === "decimal")?.value ?? "."
  return `${sign}${grouped}${decimal}${frac}`
}
