import { describe, expect, it } from "vitest"

import robots from "@/app/robots"
import sitemap from "@/app/sitemap"

/**
 * judgment-005: /welcome is the single canonical landing URL.
 * The sitemap must surface /welcome as the priority-1 landing (not bare /),
 * include the public /apps page, and robots must allow both /welcome and /apps.
 */
describe("sitemap canonicalizes the landing on /welcome", () => {
  const entries = sitemap()
  const byUrl = (u: string) => entries.find((e) => e.url === u)

  it("includes the /welcome URL", () => {
    expect(byUrl("https://certified.app/welcome")).toBeDefined()
  })

  it("treats /welcome as the priority-1 landing", () => {
    expect(byUrl("https://certified.app/welcome")?.priority).toBe(1)
  })

  it("does not list bare / as a priority-1 landing", () => {
    const bare = byUrl("https://certified.app/")
    expect(bare === undefined || bare.priority !== 1).toBe(true)
  })

  it("includes the public /apps page", () => {
    expect(byUrl("https://certified.app/apps")).toBeDefined()
  })
})

describe("robots allows the canonical landing surfaces", () => {
  const rules = robots().rules
  const rule = Array.isArray(rules) ? rules[0] : rules
  const allow = (
    Array.isArray(rule?.allow) ? rule.allow : [rule?.allow]
  ).filter((v): v is string => typeof v === "string")

  it("allows /welcome", () => {
    expect(allow).toContain("/welcome")
  })

  it("allows /apps", () => {
    expect(allow).toContain("/apps")
  })
})
