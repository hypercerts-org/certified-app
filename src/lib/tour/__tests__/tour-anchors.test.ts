import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { TOUR_STEPS } from "../tour-steps"

/**
 * Every anchored tour step must point at a `data-tour` anchor that some
 * component still renders; otherwise the step silently falls back to a
 * centered card. Anchors are set directly (`data-tour="x"`) or through a
 * prop that ends up there (`tour="x"`, `tour: "x"`, `submitTourId="x"`).
 */
const SRC = join(__dirname, "../../..")

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

describe("tour anchors", () => {
  const sources = sourceFiles(SRC)
    .filter((p) => !p.includes(join("lib", "tour")) && !p.includes(join("app", "dev")))
    .map((p) => readFileSync(p, "utf8"))
    .join("\n")

  for (const step of TOUR_STEPS) {
    if (!step.anchor) continue
    it(`"${step.id}" points at a rendered anchor (${step.anchor})`, () => {
      const pattern = new RegExp(
        `(data-tour|tour|TourId)\\s*[=:]\\s*\\{?\\s*["'\`]${step.anchor}["'\`]`,
      )
      expect(pattern.test(sources)).toBe(true)
    })
  }
})
