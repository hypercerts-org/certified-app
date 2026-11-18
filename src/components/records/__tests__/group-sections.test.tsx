import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react"

// Workspace → Endorsements while acting as a group: the group's own
// records, read for its DID; writes as the group through the group routes
// (the lib's `targetDid` path); a member reads. (Followers are on the
// profile, not a Workspace section.)

const SESSION = "did:plc:me"
const GROUP = "did:plc:group"

const nav = { kind: "endorsements", tab: "received" }
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`kind=${nav.kind}&tab=${nav.tab}`),
  usePathname: () => "/records",
}))

vi.mock("@/hooks/use-url-param", () => ({
  useUrlParam: () => [nav.tab, vi.fn()],
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isLoading: false, isAuthenticated: true, did: SESSION }),
}))

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ handle: "me.certified.app" }),
}))

type ActiveOrg = { groupDid: string; handle: string; displayName: string; role: string; accepted: boolean }
const org = { activeOrg: null as ActiveOrg | null, groups: [] as unknown[], isLoading: false }
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => org,
}))

vi.mock("@/lib/groups/use-switch-actor", () => ({
  useSwitchActor: () => vi.fn(),
}))

const PEOPLE: Record<string, { handle: string; displayName: string }> = {
  "did:plc:ana": { handle: "ana.certified.app", displayName: "Ana Reyes" },
  "did:plc:ben": { handle: "ben.certified.app", displayName: "Ben Okafor" },
  "did:plc:cy": { handle: "cy.certified.app", displayName: "Cy Lund" },
}
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string | null) => ({
    info: did && PEOPLE[did] ? { did, ...PEOPLE[did], avatarUrl: null } : null,
    isLoading: false,
  }),
}))

// Every read records the DID it was asked for.
const reads = {
  following: [] as (string | null)[],
  given: [] as (string | null)[],
  received: [] as (string | null)[],
  responses: [] as (string | undefined)[],
  lists: [] as (string | null)[],
  followers: [] as (string | null)[],
}

const followRecord = {
  uri: `at://${GROUP}/app.certified.graph.follow/f1`,
  cid: "cf1",
  rkey: "f1",
  value: { subject: "did:plc:cy", createdAt: "2026-09-01T10:00:00Z" },
}
const following = {
  records: [followRecord],
  subjects: new Set(["did:plc:cy"]),
  count: 1,
  truncated: false,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
  addFollow: vi.fn(),
  removeFollow: vi.fn(),
}
vi.mock("@/hooks/use-following", () => ({
  useFollowing: (did: string | null) => {
    reads.following.push(did)
    return following
  },
}))

const given = {
  endorsements: [
    {
      uri: `at://${GROUP}/app.certified.badge.award/a1`,
      cid: "ca1",
      rkey: "a1",
      rkeys: ["a1"],
      subjectDid: "did:plc:cy",
      createdAt: "2026-10-01T10:00:00Z",
    },
  ],
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}
vi.mock("@/hooks/use-endorsements", () => ({
  useGivenEndorsements: (did: string | null) => {
    reads.given.push(did)
    return given
  },
}))

const RECEIVED = [
  {
    uri: "at://did:plc:ana/app.certified.badge.award/r1",
    cid: "cr1",
    issuerDid: "did:plc:ana",
    createdAt: "2026-06-30T10:00:00Z",
    responseState: null,
  },
  {
    uri: "at://did:plc:ben/app.certified.badge.award/r2",
    cid: "cr2",
    issuerDid: "did:plc:ben",
    createdAt: "2026-06-29T10:00:00Z",
    responseState: "rejected",
  },
]
vi.mock("@/hooks/use-received-endorsements", () => ({
  useReceivedEndorsements: (did: string | null) => {
    reads.received.push(did)
    return { endorsements: RECEIVED, isLoading: false, error: null, refetch: vi.fn() }
  },
}))

// The group's responses: Ben's endorsement is hidden by the group.
const RESPONSES = [
  {
    uri: `at://${GROUP}/app.certified.badge.response/s1`,
    cid: "cs1",
    rkey: "s1",
    value: { badgeAward: { uri: RECEIVED[1].uri, cid: "cr2" }, response: "rejected", createdAt: "2026-07-01T10:00:00Z" },
  },
]
vi.mock("@/hooks/use-own-response-states", () => ({
  useOwnResponseStates: (responder?: string) => {
    reads.responses.push(responder)
    return {
      resolve: (uri: string) => ({ state: uri === RECEIVED[1].uri ? "rejected" : "default" }),
      responses: RESPONSES,
      isLoading: false,
      invalidate: vi.fn(),
      refetch: vi.fn(async () => {}),
    }
  },
}))

vi.mock("@/hooks/use-endorsement-lists", () => ({
  useEndorsementLists: (did: string | null) => {
    reads.lists.push(did)
    return { lists: [], isLoading: false, error: null, refetch: vi.fn() }
  },
}))

vi.mock("@/hooks/use-followers", () => ({
  useFollowers: (did: string | null) => {
    reads.followers.push(did)
    return {
      entries: [
        { uri: "at://did:plc:ana/app.certified.graph.follow/x", followerDid: "did:plc:ana", createdAt: "2026-08-31T10:00:00Z" },
        { uri: "at://did:plc:cy/app.certified.graph.follow/y", followerDid: "did:plc:cy", createdAt: "2026-05-22T10:00:00Z" },
      ],
      count: 2,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      addFollower: vi.fn(),
      removeFollower: vi.fn(),
    }
  },
}))

// The writes: never the network.
vi.mock("@/lib/atproto/badges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atproto/badges")>()
  return {
    ...actual,
    createResponse: vi.fn(async () => ({ uri: "at://x/r/1", cid: "c" })),
    deleteAllResponsesForAward: vi.fn(async () => 1),
    deleteEndorsementAward: vi.fn(async () => {}),
    createEndorsementAward: vi.fn(async () => ({ uri: "at://x/a/1", cid: "c" })),
  }
})
vi.mock("@/lib/atproto/follow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atproto/follow")>()
  return {
    ...actual,
    createFollow: vi.fn(async () => ({ uri: `at://${GROUP}/app.certified.graph.follow/new`, cid: "cn" })),
    deleteFollow: vi.fn(async () => {}),
    listFollowing: vi.fn(async () => ({ records: [followRecord], truncated: false })),
  }
})

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

import RecordsPage from "@/components/records/records-page"
import { ToastProvider } from "@/components/ui/toast"
import {
  createResponse,
  deleteAllResponsesForAward,
  deleteEndorsementAward,
} from "@/lib/atproto/badges"

function actAs(role: "owner" | "admin" | "member") {
  org.activeOrg = {
    groupDid: GROUP,
    handle: "estuary.certified.app",
    displayName: "Estuary Alliance",
    role,
    accepted: true,
  }
}

function renderPage() {
  const view = render(
    <ToastProvider>
      <RecordsPage />
    </ToastProvider>,
  )
  return { ...view, main: view.container.querySelector(".workspace__main") as HTMLElement }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const list of Object.values(reads)) list.length = 0
  nav.kind = "endorsements"
  nav.tab = "received"
  org.activeOrg = null
})

describe("Endorsements acting as a group", () => {
  it("reads the group's received, given, responses and lists, by its DID", () => {
    actAs("owner")
    const { main } = renderPage()
    expect(reads.received).toContain(GROUP)
    expect(reads.given.at(-1)).toBe(GROUP)
    expect(reads.responses).toContain(GROUP)
    expect(reads.lists).toContain(GROUP)
    expect(reads.received).not.toContain(SESSION)
    // Not the old explanation: the pane, with its tabs and counts.
    expect(within(main).queryByText(/show on its profile/)).toBeNull()
    const tabs = within(main).getByRole("tablist", { name: "Endorsements" })
    expect(within(tabs).getByRole("tab", { name: /Received/ })).toHaveTextContent("1 · 1 hidden")
    expect(within(tabs).getByRole("tab", { name: /Given/ })).toHaveTextContent("1")
    expect(within(main).getByRole("button", { name: "Endorse someone" })).toBeInTheDocument()
  })

  it("hides and shows a received endorsement as the group's response", async () => {
    actAs("admin")
    const { main } = renderPage()
    const rows = within(main).getAllByRole("listitem")
    // The group's hidden one carries the tag.
    expect(within(rows[1]).getByText("Hidden")).toBeInTheDocument()

    fireEvent.click(within(rows[0]).getByRole("button", { name: /^Hide from profile/ }))
    await waitFor(() => expect(createResponse).toHaveBeenCalled())
    expect(createResponse).toHaveBeenCalledWith(
      SESSION,
      { uri: RECEIVED[0].uri, cid: RECEIVED[0].cid },
      "rejected",
      { targetDid: GROUP },
    )

    fireEvent.click(within(rows[1]).getByRole("button", { name: /^Show on profile/ }))
    await waitFor(() => expect(deleteAllResponsesForAward).toHaveBeenCalled())
    expect(deleteAllResponsesForAward).toHaveBeenCalledWith(SESSION, RECEIVED[1].uri, RESPONSES, {
      targetDid: GROUP,
    })
  })

  it("revokes a given endorsement as the group", async () => {
    actAs("owner")
    nav.tab = "given"
    const { main } = renderPage()
    fireEvent.click(within(main).getByRole("button", { name: "Revoke endorsement of Cy Lund" }))
    fireEvent.click(screen.getByRole("button", { name: "Revoke endorsement" }))
    await waitFor(() => expect(deleteEndorsementAward).toHaveBeenCalled())
    expect(deleteEndorsementAward).toHaveBeenCalledWith(SESSION, "a1", { targetDid: GROUP })
  })

  it("shows the group's endorsement lists read only", () => {
    actAs("owner")
    nav.tab = "lists"
    const { main } = renderPage()
    expect(within(main).getByText("Endorsement lists can't be made as a group yet.")).toBeInTheDocument()
    expect(within(main).queryByRole("button", { name: "New list" })).toBeNull()
    expect(within(main).getByText("No lists yet.")).toBeInTheDocument()
  })

  it("a member reads: no Endorse someone, Hide / Show or Revoke, and a line why", () => {
    actAs("member")
    const { main } = renderPage()
    expect(within(main).getByRole("note")).toHaveTextContent(
      "Only Estuary Alliance's owners and admins can change its endorsements.",
    )
    expect(within(main).queryByRole("button", { name: "Endorse someone" })).toBeNull()
    expect(within(main).queryByRole("button", { name: /Hide from profile|Show on profile/ })).toBeNull()
    // The rows (and the Hidden tag) still show.
    expect(within(main).getByText("Hidden")).toBeInTheDocument()
    expect(within(main).getByText("Ana Reyes")).toBeInTheDocument()
  })

  it("a member sees given endorsements without Revoke", () => {
    actAs("member")
    nav.tab = "given"
    const { main } = renderPage()
    expect(within(main).getByText("Cy Lund")).toBeInTheDocument()
    expect(within(main).queryByRole("button", { name: /Revoke/ })).toBeNull()
  })
})
