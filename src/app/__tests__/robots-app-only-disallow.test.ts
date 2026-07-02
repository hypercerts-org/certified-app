import { describe, expect, it } from "vitest"

import robots from "@/app/robots"

/**
 * risk-006: authenticated / app-only surfaces must not be crawlable.
 * AGENTS.md §18 mandates app-only pages stay out of the index. Since auth
 * is fully client-side (no middleware), the unauthenticated shells of
 * /home, /explore and /activity render a 200 that Googlebot can
 * index. Cover them via robots.ts disallow (the client-component route
 * /activity cannot export `metadata`).
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

  it("keeps genuinely public record surfaces indexable (no /project disallow)", () => {
    expect(disallow).not.toContain("/project")
  })

  it("disallows the /profile redirect stub (next-robots-omits-internal-routes)", () => {
    // /profile is a client redirect stub, not a public surface, so it must
    // stay out of the index alongside /workspace and /endorsement-graph.
    expect(disallow).toContain("/profile")
  })
})
