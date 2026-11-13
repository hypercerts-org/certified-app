import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

import type { ActivityRecord } from "@/lib/atproto/activity-types"

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: false }),
}))

vi.mock("@/hooks/use-contributor-info", () => ({
  useContributorInfo: () => ({ info: null, isAtproto: false }),
}))

const breakpoints = { isDesktop: true }
vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({
    isDesktop: breakpoints.isDesktop,
    hasRightRail: breakpoints.isDesktop,
    isFullDesktop: false,
    isStandalone: false,
  }),
}))

import ActivityRow from "../activity-row"

const DID = "did:plc:me"
const RECORD = {
  uri: `at://${DID}/org.hypercerts.claim.activity/abc`,
  cid: "bafy",
  value: { title: "River survey", createdAt: "2026-05-27T10:00:00Z" },
} as unknown as ActivityRecord

function renderRow() {
  return render(
    <ul>
      <ActivityRow
        record={RECORD}
        did={DID}
        actor="me.certified.app"
        otherProjects={[]}
        selected={false}
        onToggleSelect={vi.fn()}
        onDelete={vi.fn()}
        onAddToProject={vi.fn()}
      />
    </ul>,
  )
}

describe("ActivityRow controls (PA2, PA3)", () => {
  it("keeps the select box in the DOM and the Tab order, marked to reveal on hover", () => {
    renderRow()
    const box = screen.getByRole("checkbox", { name: "Select River survey" })
    expect(box).not.toHaveAttribute("tabindex", "-1")
    expect(box.closest(".records-row__check")).toHaveClass("records-reveal")
  })

  it("keeps the Edit shortcut focusable, marked to reveal on hover", () => {
    renderRow()
    const edit = screen.getByRole("link", { name: "Edit River survey" })
    expect(edit).toHaveAttribute("href", "/me.certified.app/activity/abc/edit")
    expect(edit).toHaveClass("records-reveal")
  })

  it("gives the row's link the one whole-row hover tint", () => {
    renderRow()
    expect(screen.getByRole("link", { name: /^River survey/ })).toHaveClass(
      "records-row__main",
      "hover-tint",
      "hover-tint--bleed",
    )
  })

  it("lists Edit in the More actions menu on desktop too", () => {
    renderRow()
    fireEvent.click(screen.getByRole("button", { name: "More actions for River survey" }))
    const menu = screen.getByRole("menu", { name: "More actions for River survey" })
    expect(within(menu).getByRole("menuitem", { name: "Edit" })).toHaveAttribute(
      "href",
      "/me.certified.app/activity/abc/edit",
    )
  })
})

describe("records.css reveal rule", () => {
  const css = readFileSync(path.resolve(__dirname, "../../../app/styles/records.css"), "utf8")
  const hoverBlock = css.slice(css.indexOf("@media (hover: hover) and (pointer: fine) {\n  .records-reveal"))

  it("hides the controls only on devices with a mouse", () => {
    expect(hoverBlock.length).toBeGreaterThan(0)
    expect(hoverBlock).toMatch(/\.records-reveal \{\s*opacity: 0;/)
    // Never display:none or visibility:hidden, which would drop them from
    // the Tab order.
    expect(hoverBlock.slice(0, hoverBlock.indexOf("\n}\n"))).not.toMatch(/display: none|visibility: hidden/)
  })

  it("leaves row hover to the tint: no title underline on hover", () => {
    expect(css).not.toMatch(/:hover \.records-(row__title|person__name)/)
  })

  it("brings them back on hover, keyboard focus and while selecting", () => {
    const block = hoverBlock.slice(0, hoverBlock.indexOf("\n}\n"))
    expect(block).toContain(".records-row:hover .records-reveal")
    expect(block).toContain(".records-row:focus-within .records-reveal")
    expect(block).toContain(".records-work[data-selecting] .records-row__check.records-reveal")
  })
})
