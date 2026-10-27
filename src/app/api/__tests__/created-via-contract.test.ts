import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * Contract test: every record write goes through a `#createdVia` signing
 * point.
 *
 * Signing lives in three places — the xrpc proxy (own-repo writes), the
 * OAuth callback's profile seed, and `groupServiceFetch` (every group
 * write). A fourth write path would silently ship unsigned records, so this
 * scans the source the same way `groups/__tests__/write-rate-limit-contract`
 * does: a new path fails at `npm test`, not in production.
 *
 * The group activity route used to POST to CGS with a raw `fetch`, skipping
 * `groupServiceFetch` — exactly the gap the raw-fetch check below pins.
 */

const SRC_ROOT = join(__dirname, "..", "..", "..")
const REPO_ROOT = join(SRC_ROOT, "..")

const SIGNING_POINTS = [
  "src/app/api/xrpc/[...method]/route.ts",
  "src/app/api/auth/callback-handler/route.ts",
  "src/lib/groups/proxy-agent.ts",
]
const GROUP_ROUTE = /^src\/app\/api\/groups\/\[groupDid\]\/[^/]+\/route\.ts$/

function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue
      collectSources(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      acc.push(full)
    }
  }
  return acc
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const sources = collectSources(SRC_ROOT).map((file) => ({
  rel: relative(REPO_ROOT, file).split(sep).join("/"),
  code: stripComments(readFileSync(file, "utf8")),
}))

// Method calls (`agent.com.atproto.repo.putRecord(`) and NSID strings
// (`callPds(did, "com.atproto.repo.putRecord")`, `/xrpc/com.atproto.repo…`).
const DIRECT_WRITE = /repo\.createRecord\(|repo\.putRecord\(|applyWrites|com\.atproto\.repo\.(createRecord|putRecord)\b/
const GROUP_WRITE = /group\.repo\.(create|put)Record/

describe("createdVia contract — every record write is signed", () => {
  it("direct PDS writes appear only at the signing points", () => {
    const offenders = sources
      .filter((s) => DIRECT_WRITE.test(s.code))
      .map((s) => s.rel)
      .filter((rel) => !SIGNING_POINTS.includes(rel))
    expect(offenders).toEqual([])
  })

  it("group record writes appear only in proxy-agent and the group routes", () => {
    const offenders = sources
      .filter((s) => GROUP_WRITE.test(s.code))
      .map((s) => s.rel)
      .filter((rel) => rel !== "src/lib/groups/proxy-agent.ts" && !GROUP_ROUTE.test(rel))
    expect(offenders).toEqual([])
  })

  it("only proxy-agent and the non-record CGS routes reach the group service URL", () => {
    // These call CGS endpoints that write no records (register, import,
    // membership list, destroy). Anything else must use groupServiceFetch.
    const allowed = [
      "src/lib/groups/proxy-agent.ts",
      "src/lib/groups/constants.ts",
      "src/app/api/groups/register/route.ts",
      "src/app/api/groups/import/route.ts",
      "src/app/api/groups/memberships/route.ts",
      "src/app/api/groups/[groupDid]/destroy/route.ts",
    ]
    const offenders = sources
      .filter((s) => /\bGROUP_SERVICE(_URL)?\b|NEXT_PUBLIC_GROUP_SERVICE_URL/.test(s.code))
      .map((s) => s.rel)
      .filter((rel) => !allowed.includes(rel))
    expect(offenders).toEqual([])
  })

  it("every signing point calls signCreatedVia", () => {
    for (const rel of SIGNING_POINTS) {
      const src = sources.find((s) => s.rel === rel)
      expect(src, rel).toBeDefined()
      expect(src!.code, rel).toMatch(/signCreatedVia\(/)
    }
    const proxy = sources.find((s) => s.rel === "src/lib/groups/proxy-agent.ts")!.code
    const start = proxy.indexOf("export async function groupServiceFetch")
    expect(start).toBeGreaterThan(-1)
    const fetchFn = proxy.slice(start)
    const end = fetchFn.indexOf("\n}\n")
    expect(end).toBeGreaterThan(0)
    expect(fetchFn.slice(0, end)).toMatch(/signGroupRecordBody\(/)
  })
})
