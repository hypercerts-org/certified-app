import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { OPERATIONS } from "../operations"

/**
 * Contract test: every operation name the client asks for must exist in
 * the server's `OPERATIONS` map.
 *
 * The indexer proxy is a trust boundary — the client sends an
 * `operationName` and the server holds the query strings, refusing
 * anything it doesn't recognise (`route.ts`: `Object.hasOwn(OPERATIONS,
 * operationName)` → 400 "Unknown operation"). That check is correct, and
 * it is also invisible: a hook that asks for an operation nobody added to
 * `operations.ts` compiles, type-checks, lints, and passes every
 * single-layer test, then 400s in production.
 *
 * This is the same failure shape as the XRPC write allowlist that broke
 * own-repo activity updates — see `allowed-collections.test.ts`, the
 * sibling of this test. Both sides are individually correct; only the
 * pair is wrong. So we check the pair.
 *
 * Deliberately a source scan rather than a runtime check: the operation
 * names are string literals at ~30 call sites, and extracting them
 * statically is what lets this fail at `npm test` instead of at runtime.
 * If you add a `postIndexer` call, add the query to `operations.ts` and
 * this passes on its own.
 */

const SRC_ROOT = join(__dirname, "..", "..", "..", "..")

/** Source files that could contain a client call, excluding test fixtures. */
function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // __tests__ files use invented operation names against a stubbed
      // fetch (e.g. "ThingCount"); they never reach the real route.
      if (entry === "__tests__" || entry === "node_modules") continue
      collectSourceFiles(full, acc)
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

/**
 * Match the first string argument to postIndexer/getIndexer, across both
 * the single-line form — postIndexer<T>("Followers", {...}) — and the
 * prettier-wrapped form where the name lands on the next line.
 */
const CALL_RE = /\b(?:postIndexer|getIndexer)\s*(?:<[^>()]*>)?\s*\(\s*"([A-Za-z0-9_]+)"/g

interface Usage {
  operationName: string
  file: string
}

function findUsages(): Usage[] {
  const usages: Usage[] = []
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(CALL_RE)) {
      usages.push({ operationName: match[1], file: relative(SRC_ROOT, file) })
    }
  }
  return usages
}

describe("indexer operation contract", () => {
  const usages = findUsages()

  it("finds client call sites at all (guards against the scanner silently breaking)", () => {
    // If a refactor renames postIndexer or changes the call shape, this
    // test would otherwise pass vacuously by finding nothing.
    expect(usages.length).toBeGreaterThan(10)
  })

  it("every operation the client requests exists in OPERATIONS", () => {
    const missing = usages.filter(
      (u) => !Object.hasOwn(OPERATIONS, u.operationName),
    )

    expect(
      missing.map((u) => `${u.operationName} (${u.file})`),
      "these would 400 'Unknown operation' at runtime — add the query to src/app/api/indexer/operations.ts",
    ).toEqual([])
  })

  it("every OPERATIONS entry is a non-empty GraphQL document", () => {
    for (const [name, query] of Object.entries(OPERATIONS)) {
      expect(typeof query, `${name} should map to a query string`).toBe("string")
      expect(query.trim().length, `${name} should not be empty`).toBeGreaterThan(0)
      // The proxy forwards `operationName` alongside the document, so the
      // document must actually declare that operation or the upstream
      // rejects it.
      expect(query, `${name} should declare operation "${name}"`).toContain(name)
    }
  })
})
