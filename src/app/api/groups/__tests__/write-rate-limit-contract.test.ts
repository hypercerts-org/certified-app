import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { RATE_LIMITED_WRITE_COLLECTIONS } from "@/lib/auth/rate-limit"

/**
 * Contract test: every group BFF route that writes a rate-limited
 * collection must call `enforceWriteRateLimit`.
 *
 * The per-DID write limiter is applied by the xrpc proxy. Group BFF routes
 * bypass that proxy BY DESIGN — they call
 * `app.certified.group.repo.createRecord` through the operator's session
 * instead of `com.atproto.repo.createRecord` — so the proxy's limiter never
 * sees them and each route has to enforce the limit itself.
 *
 * Both sides of that coupling look correct alone. The registry is right;
 * each route is locally sensible. Only the pair is wrong, which is exactly
 * how `funding/route.ts` shipped unlimited while
 * `org.hypercerts.funding.receipt` sat in the registry (HYPER-575) — and
 * why finding it required enumerating all nine routes rather than reading
 * any one of them. So we check the pair.
 *
 * Same shape as `src/app/api/indexer/__tests__/operation-contract.test.ts`:
 * a source scan, so a new route fails at `npm test` rather than in
 * production. Add a group route that writes a registry-listed collection
 * and this fails until you add the limiter.
 */

const GROUPS_ROOT = join(__dirname, "..")
const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..")

/** Every `route.ts` under src/app/api/groups, excluding test fixtures. */
function collectRoutes(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue
      collectRoutes(full, acc)
    } else if (entry === "route.ts") {
      acc.push(full)
    }
  }
  return acc
}

/**
 * Strip comments and import statements before scanning.
 *
 * Comments so a collection named only in prose doesn't count as a write.
 * Imports because an UNUSED `import { enforceWriteRateLimit }` left behind
 * by a deleted call would otherwise satisfy the check — the first draft of
 * this test passed with the funding limiter ripped out for exactly that
 * reason.
 */
function stripCommentsAndImports(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import\s[\s\S]*?from\s+"[^"]+"\s*$/gm, "")
}

interface RouteWrite {
  file: string
  collection: string
  enforces: boolean
}

function findWritingRoutes(): RouteWrite[] {
  const out: RouteWrite[] = []
  for (const file of collectRoutes(GROUPS_ROOT)) {
    const raw = readFileSync(file, "utf8")
    const code = stripCommentsAndImports(raw)
    // Only creates matter: the limiter counts writes, and the proxy's own
    // limiter is likewise gated on createRecord.
    if (!code.includes("group.repo.createRecord")) continue
    for (const collection of Object.keys(RATE_LIMITED_WRITE_COLLECTIONS)) {
      if (!code.includes(`"${collection}"`)) continue
      out.push({
        file: relative(REPO_ROOT, file),
        collection,
        enforces: /\benforceWriteRateLimit\s*\(/.test(code),
      })
    }
  }
  return out
}

describe("group BFF write rate-limit contract", () => {
  it("finds the group routes that write rate-limited collections", () => {
    const writes = findWritingRoutes()
    // Guard the scan itself: a rename or a moved directory that silently
    // matched nothing would make every assertion below vacuously pass.
    expect(writes.length).toBeGreaterThanOrEqual(2)
    expect(writes.map((w) => w.collection)).toContain(
      "app.certified.badge.award",
    )
    expect(writes.map((w) => w.collection)).toContain(
      "org.hypercerts.funding.receipt",
    )
  })

  it("every one of them enforces the limit", () => {
    const missing = findWritingRoutes().filter((w) => !w.enforces)
    expect(
      missing.map((w) => `${w.file} writes ${w.collection} unlimited`),
    ).toEqual([])
  })
})
