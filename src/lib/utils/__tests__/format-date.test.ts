import { describe, it, expect } from "vitest"
import {
  formatShortDate,
  formatMonthYear,
  formatRelativeDate,
  formatTimePeriod,
} from "../format-date"

describe("formatShortDate", () => {
  it("formats a full ISO timestamp as '9 Mar 2024' in UTC", () => {
    expect(formatShortDate("2024-03-09T12:34:56.000Z")).toBe("9 Mar 2024")
  })

  it("formats a date-only string", () => {
    expect(formatShortDate("2024-12-31")).toBe("31 Dec 2024")
  })

  it("uses UTC components, not the local timezone", () => {
    // Just before UTC midnight: a local (e.g. US) timezone would roll the
    // calendar day back, but the formatter must report the UTC day.
    expect(formatShortDate("2024-06-15T23:59:59.000Z")).toBe("15 Jun 2024")
  })

  it("returns the raw input unchanged for unparseable dates", () => {
    expect(formatShortDate("not-a-date")).toBe("not-a-date")
    expect(formatShortDate("")).toBe("")
  })
})

describe("formatMonthYear", () => {
  it("formats month precision as 'Mar 2024' in UTC", () => {
    expect(formatMonthYear("2024-03-09T12:34:56.000Z")).toBe("Mar 2024")
    expect(formatMonthYear("2024-12-31")).toBe("Dec 2024")
  })

  it("has no hyphen to break a line at", () => {
    expect(formatMonthYear("2023-02-01")).not.toContain("-")
  })

  it("returns null for unparseable input", () => {
    expect(formatMonthYear("not-a-date")).toBeNull()
    expect(formatMonthYear("")).toBeNull()
  })
})

describe("formatRelativeDate", () => {
  const now = Date.parse("2026-11-13T12:00:00.000Z")

  it("is relative up to 7 days", () => {
    expect(formatRelativeDate("2026-11-13T11:59:40.000Z", now)).toBe("just now")
    expect(formatRelativeDate("2026-11-13T11:55:00.000Z", now)).toBe("5m ago")
    expect(formatRelativeDate("2026-11-13T09:00:00.000Z", now)).toBe("3h ago")
    expect(formatRelativeDate("2026-11-07T12:00:01.000Z", now)).toBe("5d ago")
  })

  it("is the absolute date from 7 days on", () => {
    expect(formatRelativeDate("2026-11-06T12:00:00.000Z", now)).toBe("6 Nov 2026")
    expect(formatRelativeDate("2025-05-23T08:00:00.000Z", now)).toBe("23 May 2025")
  })

  it("treats a future date as now and an unparseable one as empty", () => {
    expect(formatRelativeDate("2026-11-14T12:00:00.000Z", now)).toBe("just now")
    expect(formatRelativeDate("nope", now)).toBe("")
  })
})

describe("formatTimePeriod", () => {
  it("joins both dates with an en dash", () => {
    expect(formatTimePeriod("2026-01-01", "2026-03-15")).toBe("1 Jan 2026 – 15 Mar 2026")
  })

  it("marks a start-only period as ongoing", () => {
    expect(formatTimePeriod("2026-01-01", null)).toBe("1 Jan 2026 (ongoing)")
  })

  it("renders an end-only period as Until", () => {
    expect(formatTimePeriod(null, "2026-03-15")).toBe("Until 15 Mar 2026")
  })

  it("returns null when neither bound is set", () => {
    expect(formatTimePeriod(null, null)).toBeNull()
  })
})
