import { describe, it, expect, afterEach, vi } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

import EndorsementSubjectRow, {
  type EndorsementSubjectRowClasses,
} from "../endorsement-subject-row"
import type { AuthorInfo } from "@/hooks/use-author-info"

// The shared subject row replaced three hand-rolled copies
// (endorsement-row, endorsement-lists' ListItemRow, and
// profile-endorsements' EndorsementRowBody) whose loading states,
// identity fallbacks, and <time> semantics had drifted apart. These
// tests pin the unified behavior: skeleton only while info resolves,
// deriveIdentity fallbacks (truncated DID, no @did handles), optional
// note, full dateTime + tooltip on the date, and the trailing slot.

const info: AuthorInfo = {
  did: "did:plc:abcdefghijklmnopqrstuvwx",
  handle: "alice.test",
  displayName: "Alice",
  avatarUrl: null,
}

const CLASSES: EndorsementSubjectRowClasses = {
  main: "t-main",
  meta: "t-meta",
  name: "t-name",
  handle: "t-handle",
  note: "t-note",
  date: "t-date",
}

const CREATED_AT = "2024-01-02T03:04:05.000Z"

afterEach(() => {
  cleanup()
})

describe("EndorsementSubjectRow", () => {
  it("renders name, @handle and a profile link from resolved info", () => {
    const { container } = render(
      <EndorsementSubjectRow
        did={info.did}
        info={info}
        isLoading={false}
        createdAt={CREATED_AT}
        classes={CLASSES}
      />,
    )
    expect(container.querySelector(".t-name")?.textContent).toBe("Alice")
    expect(container.querySelector(".t-handle")?.textContent).toBe(
      "@alice.test",
    )
    const link = container.querySelector("a.t-main")
    expect(link?.getAttribute("href")).toBe("/alice.test")
    // Resolved info → avatar, not the loading skeleton.
    expect(container.querySelector(".animate-pulse")).toBeNull()
  })

  it("shows the avatar skeleton only while info is loading", () => {
    const loading = render(
      <EndorsementSubjectRow
        did={info.did}
        info={null}
        isLoading
        createdAt={CREATED_AT}
        classes={CLASSES}
      />,
    )
    expect(loading.container.querySelector(".animate-pulse")).not.toBeNull()
    // Canonical no-info fallback: truncated DID, never the raw DID.
    expect(loading.container.querySelector(".t-name")?.textContent).toBe(
      "did:plc:abcdefgh…stuvwx",
    )
    cleanup()

    // Loading finished without info → still the truncated-DID row, no
    // permanent skeleton.
    const settled = render(
      <EndorsementSubjectRow
        did={info.did}
        info={null}
        isLoading={false}
        createdAt={CREATED_AT}
        classes={CLASSES}
      />,
    )
    expect(settled.container.querySelector(".animate-pulse")).toBeNull()
    expect(settled.container.querySelector(".t-name")?.textContent).toBe(
      "did:plc:abcdefgh…stuvwx",
    )
  })

  it("treats a DID-valued handle as no handle", () => {
    const { container } = render(
      <EndorsementSubjectRow
        did={info.did}
        info={{ ...info, handle: info.did, displayName: null }}
        createdAt={CREATED_AT}
        classes={CLASSES}
      />,
    )
    expect(container.querySelector(".t-handle")).toBeNull()
    expect(container.querySelector(".t-name")?.textContent).toBe(
      "did:plc:abcdefgh…stuvwx",
    )
  })

  it("renders the note only when supplied", () => {
    const bare = render(
      <EndorsementSubjectRow
        did={info.did}
        info={info}
        createdAt={CREATED_AT}
        classes={CLASSES}
      />,
    )
    expect(bare.container.querySelector(".t-note")).toBeNull()
    cleanup()

    const noted = render(
      <EndorsementSubjectRow
        did={info.did}
        info={info}
        createdAt={CREATED_AT}
        note="Great work"
        classes={CLASSES}
      />,
    )
    expect(noted.container.querySelector(".t-note")?.textContent).toBe(
      "Great work",
    )
  })

  it("emits a <time> with dateTime, tooltip title, and the short date", () => {
    const { container } = render(
      <EndorsementSubjectRow
        did={info.did}
        info={info}
        createdAt={CREATED_AT}
        classes={CLASSES}
      />,
    )
    const time = container.querySelector("time.t-date")
    expect(time?.getAttribute("dateTime")).toBe(CREATED_AT)
    expect(time?.getAttribute("title")).toBe(
      new Date(CREATED_AT).toLocaleString(),
    )
    expect(time?.textContent).toBe("2024-01-02")
    // Default placement: the date is a sibling of the link, not link
    // content.
    expect(time?.closest("a")).toBeNull()
  })

  it("stacks the date inside the meta column with dateInMeta", () => {
    const { container } = render(
      <EndorsementSubjectRow
        did={info.did}
        info={info}
        createdAt={CREATED_AT}
        dateInMeta
        classes={CLASSES}
      />,
    )
    const time = container.querySelector("time.t-date")
    expect(time?.parentElement?.classList.contains("t-meta")).toBe(true)
    // No second copy outside the link.
    expect(container.querySelectorAll("time.t-date")).toHaveLength(1)
  })

  it("renders the trailing slot (revoke button) and forwards clicks", () => {
    const onRevoke = vi.fn()
    const { getByRole } = render(
      <EndorsementSubjectRow
        did={info.did}
        info={info}
        createdAt={CREATED_AT}
        classes={CLASSES}
        trailing={
          <button
            type="button"
            aria-label="Revoke endorsement of Alice"
            onClick={onRevoke}
          >
            x
          </button>
        }
      />,
    )
    const button = getByRole("button", { name: "Revoke endorsement of Alice" })
    fireEvent.click(button)
    expect(onRevoke).toHaveBeenCalledTimes(1)
  })

  it("renders an unlinked 'Unknown' row when the DID is null", () => {
    const { container } = render(
      <EndorsementSubjectRow
        did={null}
        info={null}
        createdAt={CREATED_AT}
        classes={CLASSES}
      />,
    )
    expect(container.querySelector("a")).toBeNull()
    expect(container.querySelector("div.t-main")).not.toBeNull()
    expect(container.querySelector(".t-name")?.textContent).toBe("Unknown")
  })
})
