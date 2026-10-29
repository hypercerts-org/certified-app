import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import Avatar from "../avatar"

/**
 * QA pass 2026-10-29: in dark mode, logo avatars with dark or transparent
 * backgrounds vanished into the canvas (the hairline was --border-subtle,
 * 4% white). Image avatars now take their ring and backdrop from
 * --avatar-ring / --avatar-backdrop, which dark mode lifts.
 */

describe("Avatar with an image", () => {
  it("uses the avatar ring and backdrop tokens", () => {
    const { container } = render(<Avatar src="https://example.com/a.png" alt="A" />)
    const box = container.firstElementChild as HTMLElement
    expect(box.className).toContain("border-[var(--avatar-ring)]")
    expect(box.className).toContain("bg-[var(--avatar-backdrop)]")
  })

  it("keeps the backdrop on the bordered (stacked) variant", () => {
    const { container } = render(<Avatar src="https://example.com/a.png" alt="A" bordered />)
    expect((container.firstElementChild as HTMLElement).className).toContain("bg-[var(--avatar-backdrop)]")
  })
})

describe("avatar tokens", () => {
  const css = readFileSync(join(__dirname, "../../../app/styles/tokens.css"), "utf8")
  const dark = css.slice(css.indexOf(':root[data-theme="dark"]'))

  it("are transparent / subtle in light mode and lifted in dark mode", () => {
    expect(css).toMatch(/--avatar-ring: var\(--border-subtle\)/)
    expect(css).toMatch(/--avatar-backdrop: transparent/)
    expect(dark).toMatch(/--avatar-ring: var\(--border-hover\)/)
    expect(dark).toMatch(/--avatar-backdrop: var\(--color-surface-container-high\)/)
  })
})
