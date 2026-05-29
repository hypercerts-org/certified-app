import { describe, it, expect } from "vitest"

import { auditResultClassSuffix } from "../org-settings"

// bug-006: the audit-log result pill allowlist must match the actual
// domain values for AuditEntry.result ("permitted" | "denied"), so the
// rendered pill carries `org-audit__result--permitted` /
// `org-audit__result--denied` rather than always falling through to
// the unstyled `--unknown` class.
describe("auditResultClassSuffix", () => {
  it("passes through 'permitted'", () => {
    expect(auditResultClassSuffix("permitted")).toBe("permitted")
  })

  it("passes through 'denied'", () => {
    expect(auditResultClassSuffix("denied")).toBe("denied")
  })

  it("falls back to 'unknown' for unexpected values", () => {
    expect(auditResultClassSuffix("something-else")).toBe("unknown")
  })
})
