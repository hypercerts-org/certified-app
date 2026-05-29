import { describe, it, expect } from "vitest"
import { formatShortDate, formatMonthYear } from "../format-date"

describe("formatShortDate", () => {
  it("formats a full ISO timestamp as YYYY-MM-DD in UTC", () => {
    expect(formatShortDate("2024-03-09T12:34:56.000Z")).toBe("2024-03-09")
  })

  it("formats a date-only string as YYYY-MM-DD", () => {
    expect(formatShortDate("2024-12-31")).toBe("2024-12-31")
  })

  it("zero-pads single-digit months and days", () => {
    expect(formatShortDate("2024-01-05T00:00:00.000Z")).toBe("2024-01-05")
  })

  it("uses UTC components, not the local timezone", () => {
    // Just before UTC midnight: a local (e.g. US) timezone would roll the
    // calendar day back, but the formatter must report the UTC day.
    expect(formatShortDate("2024-06-15T23:59:59.000Z")).toBe("2024-06-15")
  })

  it("returns the raw input unchanged for unparseable dates", () => {
    expect(formatShortDate("not-a-date")).toBe("not-a-date")
    expect(formatShortDate("")).toBe("")
  })
})

describe("formatMonthYear", () => {
  it("formats a full ISO timestamp as YYYY-MM in UTC", () => {
    expect(formatMonthYear("2024-03-09T12:34:56.000Z")).toBe("2024-03")
  })

  it("formats a date-only string as YYYY-MM", () => {
    expect(formatMonthYear("2024-12-31")).toBe("2024-12")
  })

  it("zero-pads single-digit months", () => {
    expect(formatMonthYear("2024-01-05")).toBe("2024-01")
  })

  it("returns null for unparseable input", () => {
    expect(formatMonthYear("not-a-date")).toBeNull()
    expect(formatMonthYear("")).toBeNull()
  })
})
