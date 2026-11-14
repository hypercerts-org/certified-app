/** Number, money and date formatting for the /funding page. Dates are UTC
 *  so a day means the same day for every visitor. */

const usdFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})
const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const count = new Intl.NumberFormat("en-US")

/** $1,027,242 */
export function formatUsd(n: number): string {
  return usdFull.format(n)
}

/** $20.00 */
export function formatUsdCents(n: number): string {
  return usdCents.format(n)
}

/** $59k, $1.0M, $820 */
export function formatUsdShort(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`
  return `$${Math.round(n)}`
}

/** 14,886 */
export function formatCount(n: number): string {
  return count.format(n)
}

/** An amount in any currency: "$20.00", "12.5 USDC". */
export function formatMoney(amount: number, currency: string): string {
  if (currency === "USD") return formatUsdCents(amount)
  const digits = amount < 1 ? 4 : 2
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: digits })} ${currency}`.trim()
}

const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})
const shortDayFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" })
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })

/** "Sat, Nov 14, 2026" for a unix-seconds time. */
export function formatDay(t: number): string {
  return dayFmt.format(new Date(t * 1000))
}

/** "Nov 14" */
export function formatShortDay(t: number): string {
  return shortDayFmt.format(new Date(t * 1000))
}

/** "Nov" */
export function formatMonth(t: number): string {
  return monthFmt.format(new Date(t * 1000))
}

/** "09:30" */
export function formatTime(t: number): string {
  return timeFmt.format(new Date(t * 1000))
}
