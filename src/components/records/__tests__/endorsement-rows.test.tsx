import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import type { GivenEndorsement } from "@/hooks/use-endorsements"

const PEOPLE: Record<string, { handle: string; displayName: string }> = {
  "did:plc:ana": { handle: "ana.certified.app", displayName: "Ana Reyes" },
  "did:plc:ben": { handle: "ben.certified.app", displayName: "Ben Okafor" },
}

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string | null) => ({
    info: did && PEOPLE[did] ? { did, ...PEOPLE[did], avatarUrl: null } : null,
    isLoading: false,
  }),
}))

vi.mock("@/lib/atproto/badges", () => ({
  createResponse: vi.fn(),
  deleteAllResponsesForAward: vi.fn(),
  deleteEndorsementAward: vi.fn(),
}))

/** jsdom has no showModal; enough for ConfirmDialog (AppDialog) to open. */
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void
    close?: () => void
  }
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  proto.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

import ReceivedEndorsements from "../received-endorsements"
import GivenEndorsements from "../given-endorsements"

const ownStates = (hidden: string[]) =>
  ({
    resolve: (uri: string) => ({ state: hidden.includes(uri) ? "rejected" : "unknown" }),
    responses: [],
    invalidate: vi.fn(),
    refetch: vi.fn(),
  }) as unknown as Parameters<typeof ReceivedEndorsements>[0]["ownStates"]

const RECEIVED: ReceivedEndorsement[] = [
  {
    uri: "at://did:plc:ana/app.certified.badge.award/1",
    cid: "c1",
    issuerDid: "did:plc:ana",
    createdAt: "2026-06-30T10:00:00Z",
    responseState: null,
  } as unknown as ReceivedEndorsement,
  {
    uri: "at://did:plc:ben/app.certified.badge.award/2",
    cid: "c2",
    issuerDid: "did:plc:ben",
    createdAt: "2026-06-29T10:00:00Z",
    responseState: "rejected",
  } as unknown as ReceivedEndorsement,
]

const GIVEN: GivenEndorsement[] = [
  {
    uri: "at://did:plc:me/app.certified.badge.award/9",
    cid: "c9",
    rkey: "9",
    rkeys: ["9"],
    subjectDid: "did:plc:ana",
    createdAt: "2026-10-28T10:00:00Z",
  } as GivenEndorsement,
]

function renderReceived() {
  return render(
    <ReceivedEndorsements
      did="did:plc:me"
      profileHref="/me.certified.app"
      endorsements={RECEIVED}
      isLoading={false}
      error={null}
      onRetry={vi.fn()}
      ownStates={ownStates([RECEIVED[1].uri])}
    />,
  )
}

describe("Received rows (EN1, X3)", () => {
  it("puts the Hidden tag after the name, inside the account link, before the date", () => {
    renderReceived()
    const rows = screen.getAllByRole("listitem")
    const hiddenRow = rows[1]
    const link = within(hiddenRow).getByRole("link", { name: /Ben Okafor/ })
    const tag = within(link).getByText("Hidden")
    const date = hiddenRow.querySelector("time")!
    expect(tag.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The shown row has no tag.
    expect(within(rows[0]).queryByText("Hidden")).toBeNull()
    expect(
      within(hiddenRow).getByRole("button", { name: "Show the endorsement from Ben Okafor" }),
    ).toBeInTheDocument()
  })

  it("uses the people size: 40px avatar, the name in body, the handle in ui", () => {
    renderReceived()
    const row = screen.getAllByRole("listitem")[0]
    expect(row.querySelector(".h-10.w-10")).not.toBeNull()
    expect(within(row).getByText("Ana Reyes")).toHaveClass("records-person__name")
    expect(within(row).getByText("@ana.certified.app")).toHaveClass("records-person__handle")
  })
})

describe("Given rows (EN2, EN3)", () => {
  function renderGiven() {
    return render(
      <GivenEndorsements
        did="did:plc:me"
        endorsements={GIVEN}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    )
  }

  it("offers Revoke as a small text button with the same name as before", () => {
    renderGiven()
    const revoke = screen.getByRole("button", { name: "Revoke endorsement of Ana Reyes" })
    expect(revoke).toHaveTextContent("Revoke")
    fireEvent.click(revoke)
    // The existing confirm still asks first.
    expect(screen.getByText("Revoke endorsement of Ana Reyes?")).toBeInTheDocument()
  })

  it("uses the same row as Received", () => {
    const { container: given } = renderGiven()
    const givenRow = given.querySelector("li")!
    expect(givenRow).toHaveClass("records-person", "records-person--endorsement")
    expect(givenRow.querySelector(".records-person__main .h-10.w-10")).not.toBeNull()
    expect(givenRow.querySelector(".records-person__action")).not.toBeNull()
  })

  it("says so when there are none", () => {
    render(
      <GivenEndorsements did="did:plc:me" endorsements={[]} isLoading={false} error={null} onRetry={vi.fn()} />,
    )
    expect(screen.getByRole("heading", { name: "No endorsements given yet" })).toBeInTheDocument()
  })
})
