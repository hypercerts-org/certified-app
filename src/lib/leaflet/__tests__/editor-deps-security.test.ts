import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Guards against a lockfile regeneration (or a TipTap downgrade)
 * silently bringing back an editor dependency with a known paste XSS.
 * The `overrides` floors in package.json should already prevent it;
 * this test fails loudly if they are ever removed or loosened.
 *
 * - prosemirror-view < 1.42.3: GHSA-c8x8-7fp4-3x9w (TECH-796)
 * - @tiptap/core <= 3.30.4:    GHSA-cp6q-959q-f8rh
 */

function installedVersion(pkg: string): string {
  const file = path.resolve(process.cwd(), "node_modules", pkg, "package.json")
  return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version
}

function atLeast(version: string, floor: string): boolean {
  const a = version.split(/[.-]/).slice(0, 3).map(Number)
  const b = floor.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return true
}

describe("editor dependency security floors", () => {
  it("prosemirror-view is >= 1.42.3", () => {
    const v = installedVersion("prosemirror-view")
    expect(atLeast(v, "1.42.3"), `prosemirror-view ${v}`).toBe(true)
  })

  it("@tiptap/core is >= 3.30.5", () => {
    const v = installedVersion("@tiptap/core")
    expect(atLeast(v, "3.30.5"), `@tiptap/core ${v}`).toBe(true)
  })
})
