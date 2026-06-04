import { describe, expect, it } from "vitest"

import robots from "@/app/robots"

/**
 * risk-006: authenticated / app-only surfaces must not be crawlable.
 * AGENTS.md §18 mandates app-only pages stay out of the index. Since auth
 * is fully client-side (no middleware), the unauthenticated shells of
 * /home, /explore and /activity render a 200 that Googlebot can
 * index. Cover them via robots.ts disallow (the client-component routes
 * /activity and /notifications cannot export `metadata`).
 */
describe("robots.ts disallow covers app-only surfaces", () => {
  const rules = robots().rules
  const rule = Array.isArray(rules) ? rules[0] : rules
  const disallow = (
    Array.isArray(rule?.disallow) ? rule.disallow : [rule?.disallow]
  ).filter((v): v is string => typeof v === "string")

  it.each(["/home", "/explore", "/activity"])(
    "disallows the app-only route %s",
    (route) => {
      expect(disallow).toContain(route)
    },
  )

  it("keeps genuinely public surfaces indexable (no /profile or /project disallow)", () => {
    expect(disallow).not.toContain("/profile")
    expect(disallow).not.toContain("/project")
  })
})
