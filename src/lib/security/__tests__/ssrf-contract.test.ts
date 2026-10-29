import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * Contract test (TECH-811): server code fetches URLs taken from DID
 * documents or handles only through the SSRF guard (`guardedFetch`, or
 * did.ts's `fetchUntrusted` which looks the guard up). A new call site with a
 * bare `fetch(` of a PDS / DID-derived URL fails here, not in production.
 *
 * Heuristic: the first argument of a bare `fetch(` must not mention a PDS or
 * DID-derived value. Fixed upstreams (indexer, Bluesky appview, group
 * service, geocoding, ENS) don't match and are fine to fetch directly.
 */

const SRC_ROOT = join(__dirname, "..", "..", "..")
const REPO_ROOT = join(SRC_ROOT, "..")
const DERIVED = /pds|serviceEndpoint|well-known|did:web|didDoc/i

function collectServerSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue
      collectServerSources(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      if (!readFileSync(full, "utf8").trimStart().startsWith('"use client"')) acc.push(full)
    }
  }
  return acc
}

/** The source text of a call's first argument, starting at `from`. */
function firstArgument(source: string, from: number): string {
  let depth = 0
  let out = ""
  for (const ch of source.slice(from, from + 300)) {
    if ("([{".includes(ch)) depth++
    if (")]}".includes(ch)) {
      if (depth === 0) break
      depth--
    }
    if (ch === "," && depth === 0) break
    out += ch
  }
  return out
}

describe("SSRF guard contract", () => {
  it("no server code fetches a PDS / DID-derived URL without the guard", () => {
    const offenders: string[] = []
    for (const file of collectServerSources(SRC_ROOT)) {
      const source = readFileSync(file, "utf8")
      for (const m of source.matchAll(/(?<![\w.])(?:globalThis\.)?fetch\(/g)) {
        const arg = firstArgument(source, m.index! + m[0].length)
        if (DERIVED.test(arg)) {
          const line = source.slice(0, m.index).split("\n").length
          offenders.push(`${relative(REPO_ROOT, file).split(sep).join("/")}:${line}  ${arg.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("the OAuth client forwards every request through the guard", () => {
    // Its URLs come from attacker-controlled metadata (PAR, token endpoints),
    // so the heuristic above can't see them; pin the file instead.
    const source = readFileSync(join(SRC_ROOT, "lib/auth/oauth-client.ts"), "utf8")
    expect(source).not.toMatch(/(?<![\w.])(?:globalThis\.)?fetch\(/)
    expect(source.match(/guardedFetch\(/g)?.length).toBe(2)
  })
})
