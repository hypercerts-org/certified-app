import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * Contract test (TECH-807): every server module that restores an OAuth
 * session decides with isSessionGone whether a failure means signed out.
 * A caller that deletes the session or answers 401 on any error signs users
 * out on a transient auth-server or Upstash hiccup; groups/proxy-agent.ts was
 * missed once and did exactly that.
 */

const SRC_ROOT = join(__dirname, "..", "..", "..")
const REPO_ROOT = join(SRC_ROOT, "..")

// These restore only opportunistically and never delete the session or
// answer 401 on failure: login falls back to a fresh authorize, the callback
// only skips profile seeding.
const OPPORTUNISTIC = new Set([
  "src/app/api/auth/login/route.ts",
  "src/app/api/auth/callback-handler/route.ts",
])

function collect(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue
      collect(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      acc.push(full)
    }
  }
  return acc
}

describe("OAuth restore callers", () => {
  it("all classify failures with isSessionGone", () => {
    const callers: string[] = []
    const missing: string[] = []
    for (const file of collect(SRC_ROOT)) {
      const source = readFileSync(file, "utf8")
      // Code only: comments mention `client.restore(did)` too.
      const code = source
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n")
      if (!/\.restore\(\s*(did|session\.did|resolvedDid)/.test(code)) continue
      const rel = relative(REPO_ROOT, file).split(sep).join("/")
      callers.push(rel)
      if (!OPPORTUNISTIC.has(rel) && !source.includes("isSessionGone(")) missing.push(rel)
    }
    expect(callers.length).toBeGreaterThanOrEqual(5)
    expect(missing).toEqual([])
  })
})
