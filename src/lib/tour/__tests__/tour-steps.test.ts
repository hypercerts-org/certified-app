import { describe, it, expect } from "vitest"
import { TOUR_STEPS } from "../tour-steps"

// The walk-through is short and stays on the main pages: it shows where
// things are rather than opening forms.
describe("TOUR_STEPS", () => {
  it("is short: eight to ten steps on every layout", () => {
    for (const platform of ["desktop", "mobile"] as const) {
      const steps = TOUR_STEPS.filter((s) => !s.platform || s.platform === platform)
      expect(steps.length).toBeGreaterThanOrEqual(8)
      expect(steps.length).toBeLessThanOrEqual(10)
    }
  })

  it("only visits the main pages", () => {
    const pages = new Set(
      TOUR_STEPS.map((s) => s.navigateTo?.split(/[?#]/)[0]).filter(Boolean),
    )
    expect([...pages].sort()).toEqual(["/apps", "/feed", "/help", "/home", "/records", "/settings"])
  })

  it("names the create step for where you create, not 'New'", () => {
    const create = TOUR_STEPS.find((s) => s.anchor === "records-new")
    expect(create?.navigateTo).toBe("/records?kind=activities")
    expect(create?.title).toBe("Create from your Workspace")
  })

  it("starts with the welcome and ends on Help", () => {
    expect(TOUR_STEPS[0].id).toBe("welcome")
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].navigateTo).toBe("/help")
  })

  it("has unique ids", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length)
  })

  it("skips your own Settings while acting as a group", () => {
    const settings = TOUR_STEPS.find((s) => s.anchor === "settings-handle")
    expect(settings?.navigateTo).toBe("/settings#account")
    expect(settings?.personalOnly).toBe(true)
  })

  it("says each thing once, in today's words", () => {
    const byId = (id: string) => TOUR_STEPS.find((s) => s.id === id)?.body ?? ""
    expect(byId("feed")).toContain("trusted endorsers you pick in the filters")
    expect(byId("feed")).not.toMatch(/evaluator/i)
    // The Network step right after says what Network is.
    expect(byId("nav-workspace")).not.toMatch(/Network/)
  })
})
