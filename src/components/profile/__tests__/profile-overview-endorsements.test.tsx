import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react"

import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import type { GivenEndorsement } from "@/hooks/use-endorsements"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"
import type { ProfileSummary, SectionCount } from "../use-profile-summary"

// The endorser's name and avatar come from the indexer block below; the
// fallback lookup is never needed. A supported account resolves to a
// name from its DID; "did:plc:subjectfail…" stands for a failed lookup.
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string | null) => {
    const failed = !!did?.startsWith("did:plc:subjectfail")
    return {
      info: failed
        ? { did, handle: did, displayName: null, avatarUrl: null }
        : did?.startsWith("did:plc:subject")
          ? { did, handle: `${did.slice(8)}.test`, displayName: `Org ${did.slice(15)}`, avatarUrl: null }
          : null,
      isLoading: false,
      error: failed ? "Couldn't load this account." : null,
      failed,
      retry: () => {},
    }
  },
}))
// Organizations, known at once, except "…subjectwait…" (still reading
// its organization record) and "…subjectfail…" (the read failed).
vi.mock("@/hooks/use-org-marker", () => ({
  useOrgMarker: (did: string) => {
    const waiting = did.startsWith("did:plc:subjectwait")
    const failed = did.startsWith("did:plc:subjectfail")
    return {
      isOrg: !waiting && !failed,
      marker: null,
      isLoading: waiting,
      answeredFor: waiting ? null : did,
      failed,
      refresh: () => {},
    }
  },
}))
vi.mock("@/hooks/use-location", () => ({
  useLocations: () => ({ locations: [], isLoading: false }),
  loadLocation: () => Promise.resolve(null),
}))
vi.mock("@/hooks/use-activity", () => ({
  useActivity: () => ({ activity: null, isLoading: false, error: null, refetch: () => {} }),
}))
vi.mock("@/components/map/map-dynamic", () => ({ default: () => null }))

import ProfileOverview from "../profile-overview"

function endorsement(n: number, note?: string): ReceivedEndorsement {
  return {
    uri: `at://did:plc:issuer${n}/app.certified.badge.award/${n}`,
    cid: `cid${n}`,
    issuerDid: `did:plc:issuer${n}`,
    createdAt: `2026-05-1${n}T00:00:00.000Z`,
    note,
    issuer: {
      did: `did:plc:issuer${n}`,
      handle: `issuer${n}.certified.app`,
      displayName: `Issuer ${n}`,
      description: null,
      avatarCid: null,
      pds: null,
    },
  }
}

function activity(n: number): ActivityRecord {
  return {
    uri: `at://did:plc:me/org.hypercerts.claim.activity/rk${n}`,
    cid: `cid${n}`,
    value: {
      title: `Activity ${n}`,
      shortDescription: "Planting along the river.",
      createdAt: `2026-05-0${n}T00:00:00.000Z`,
    },
  } as unknown as ActivityRecord
}

function project(n: number, items: string[], title = `Project ${n}`): CollectionRecord {
  return {
    uri: `at://did:plc:me/org.hypercerts.collection/p${n}`,
    cid: `pcid${n}`,
    value: {
      title,
      shortDescription: "A project.",
      createdAt: `2026-06-0${n}T00:00:00.000Z`,
      items: items.map((uri) => ({ itemIdentifier: { uri, cid: "x" } })),
    },
  } as unknown as CollectionRecord
}

function givenTo(n: number): GivenEndorsement {
  return {
    uri: `at://did:plc:me/app.certified.badge.award/g${n}`,
    cid: `g${n}`,
    rkey: `g${n}`,
    rkeys: [`g${n}`],
    subjectDid: `did:plc:subject${n}`,
    createdAt: `2026-04-${String((n % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
  } as GivenEndorsement
}

const loaded = (value: number): SectionCount => ({ value, isLoading: false, failed: false })

/** A loaded summary, with whatever the test changes. */
function summary({
  activities = [] as ActivityRecord[],
  projects = [] as CollectionRecord[],
  received = [] as ReceivedEndorsement[],
  given = 0,
  activitiesError = null as string | null,
  projectsError = null as string | null,
  receivedError = null as string | null,
  refetchActivities = vi.fn(),
  retryProjects = vi.fn(),
  refetchReceived = vi.fn(),
} = {}): ProfileSummary {
  return {
    activities: {
      created: activities,
      contributed: [],
      dids: new Map(),
      isLoading: false,
      isLoadingMore: false,
      error: activitiesError,
      hasMore: false,
      loadMore: vi.fn(),
      refetch: refetchActivities,
    },
    recentActivities: activities,
    projects: { projects, isLoading: false, error: projectsError, truncated: false, retry: retryProjects },
    received: {
      endorsements: received,
      isLoading: false,
      error: receivedError,
      refetch: refetchReceived,
    },
    given: {
      endorsements: Array.from({ length: given }, (_, i) => givenTo(i + 1)),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    followers: {} as ProfileSummary["followers"],
    following: {} as ProfileSummary["following"],
    counts: {
      activities: { ...loaded(activities.length), failed: !!activitiesError },
      projects: { ...loaded(projects.length), failed: !!projectsError },
      endorsements: { ...loaded(received.length + given), failed: !!receivedError },
      endorsementsReceived: { ...loaded(received.length), failed: !!receivedError },
      followers: loaded(0),
      lists: loaded(0),
      endorsementsGiven: given,
      following: 0,
    },
  } as unknown as ProfileSummary
}

afterEach(() => {
  cleanup()
})

describe("ProfileOverview: Endorsements", () => {
  it("uses the shared endorsement row, its looks.css hooks included", () => {
    const { container } = render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary({
          received: [endorsement(1, "Great work on the estuary."), endorsement(2)],
        })}
      />,
    )

    const rows = container.querySelectorAll('li[data-centerpiece="endorsement"]')
    expect(rows).toHaveLength(2)
    // Newest first: Issuer 2, then Issuer 1 with the note.
    const first = rows[1] as HTMLElement
    expect(first.className).toContain("profile-overview__endorse-item")
    const link = within(first).getByRole("link")
    expect(link.getAttribute("href")).toBe("/issuer1.certified.app")
    expect(first.querySelector('[data-part="who"]')!.textContent).toBe("Issuer 1")
    // The name over the date (one text column, like the "Latest" records).
    const when = first.querySelector('[data-part="when"]')!
    expect(when.tagName).toBe("TIME")
    expect(when.parentElement).toBe(first.querySelector('[data-part="who"]')!.parentElement)
    expect(first.querySelector('[data-part="note"]')!.textContent).toBe(
      "Great work on the estuary.",
    )
    // No statement wording ("… endorsed …") any more.
    expect(first.textContent).not.toContain("endorsed")
  })

  it('links "All endorsements" to the endorsements tab even with three or fewer', () => {
    render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary({ received: [endorsement(1), endorsement(2), endorsement(3)] })}
      />,
    )
    const all = screen.getByRole("link", { name: /All endorsements/ })
    expect(all.getAttribute("href")).toBe("/me.certified.app?tab=endorsements")
  })

  it("tells the account itself it has none yet, without an \"All endorsements\" link", () => {
    render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary()}
        viewerIsOwner
      />,
    )
    expect(screen.queryByRole("link", { name: /All endorsements/ })).toBeNull()
    expect(screen.getByText(/No endorsements yet/)).toBeTruthy()
  })

  it("shows the accounts it supports: twelve, by name, and a link to all of them", () => {
    const { container } = render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary({ received: [endorsement(1)], given: 148 })}
      />,
    )
    // "Endorses", not "Supports" (which reads as money on a funder).
    expect(screen.getByRole("heading", { name: /^Endorses/ })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: /Supports/ })).toBeNull()
    const tiles = container.querySelectorAll(".profile-supports__item")
    expect(tiles).toHaveLength(12)
    // Names, never handles.
    expect(tiles[0].querySelector(".profile-supports__name")!.textContent).toMatch(/^Org \d+$/)
    expect(container.querySelector(".profile-supports")!.textContent).not.toContain(".test")
    const all = screen.getByRole("link", { name: "All 148" })
    expect(all.getAttribute("href")).toBe("/me.certified.app?tab=endorsements&sub=given")
  })

  it("has no Endorses section for an account that endorsed nobody", () => {
    render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary({ received: [endorsement(1)] })}
      />,
    )
    expect(screen.queryByRole("heading", { name: /^Endorses/ })).toBeNull()
  })

  it("never draws an endorsed account whose kind isn't known as a person, nor a failed lookup as an unnamed account", () => {
    const tile = (subjectDid: string): GivenEndorsement =>
      ({ ...givenTo(1), uri: `at://x/${subjectDid}`, subjectDid }) as GivenEndorsement
    const { container } = render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={{
          ...summary(),
          given: {
            endorsements: [tile("did:plc:subjectwait1"), tile("did:plc:subjectfail2")],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
          },
        } as unknown as ProfileSummary}
      />,
    )
    const tiles = container.querySelectorAll(".profile-supports__item")
    expect(tiles).toHaveLength(2)
    // Kind still being read: a placeholder block, no avatar at all (so no
    // person's circle).
    const waiting = Array.from(tiles).find((t) => t.textContent?.includes("Org"))!
    expect(waiting.querySelector('[data-shape]')).toBeNull()
    // The failed lookup says so, and still links to the profile.
    const failed = Array.from(tiles).find((t) => t.textContent?.includes("Couldn't load"))!
    expect(failed.textContent).toBe("Couldn't load this account")
    expect(failed.textContent).not.toContain("Unnamed account")
    expect(failed.querySelector("a")!.getAttribute("href")).toBe("/did:plc:subjectfail2")
  })
})

describe("ProfileOverview: the same work once", () => {
  it("leaves out an activity its same-titled project already shows", () => {
    const covered = activity(1)
    const own = activity(2)
    render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary({
          activities: [covered, own],
          projects: [project(1, [covered.uri], "Activity 1")],
        })}
      />,
    )
    expect(screen.getAllByRole("heading", { level: 3, name: "Activity 1" })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 3, name: "Activity 2" })).toBeTruthy()
  })

  it("lays one card out wide and two or more in a grid", () => {
    const { container } = render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary({ activities: [activity(1)], projects: [project(1, []), project(2, [])] })}
      />,
    )
    const lists = container.querySelectorAll(".work-card-list")
    expect(lists[0].className).toContain("work-card-list--wide")
    expect(lists[1].className).toContain("work-card-list--grid")
  })
})

describe("ProfileOverview: what a visitor sees", () => {
  it("hides empty sections from a visitor, and says once that there is nothing yet", () => {
    render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary()}
      />,
    )
    expect(screen.queryByRole("heading", { name: "Activities" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Projects" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Endorsements" })).toBeNull()
    expect(screen.queryByText(/No endorsements yet/)).toBeNull()
    // Not "activities, projects or endorsements": a donor has none of those.
    expect(screen.getAllByText("No public records yet.")).toHaveLength(1)
  })

  it("keeps every section for the account itself, with the action that fills it", () => {
    render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary()}
        viewerIsOwner
      />,
    )
    expect(screen.getByRole("heading", { name: "Activities" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "New activity" }).getAttribute("href")).toBe("/create")
    expect(screen.getByRole("link", { name: "New project" }).getAttribute("href")).toBe(
      "/project/new",
    )
  })

  it("shows activities as work cards, without repeating the account as author", () => {
    const { container } = render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary({ activities: [activity(1), activity(2)] })}
      />,
    )
    const cards = container.querySelectorAll(".work-card-list .work-card")
    expect(cards).toHaveLength(2)
    expect(container.querySelector(".feed-card__author")).toBeNull()
    expect(screen.getByRole("heading", { level: 3, name: "Activity 1" })).toBeTruthy()
  })
})

describe("ProfileOverview: load failures", () => {
  it("says a section couldn't load, with Try again, instead of showing it empty", () => {
    const refetchActivities = vi.fn()
    render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary({ activitiesError: "boom", refetchActivities })}
      />,
    )
    expect(screen.getByText("Couldn't load activities")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(refetchActivities).toHaveBeenCalled()
  })

  it("shows one block, not three, when everything failed", () => {
    const refetchActivities = vi.fn()
    const retryProjects = vi.fn()
    const refetchReceived = vi.fn()
    render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary({
          activitiesError: "boom",
          projectsError: "boom",
          receivedError: "boom",
          refetchActivities,
          retryProjects,
          refetchReceived,
        })}
      />,
    )
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.getByText("Couldn't load this account's records")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(refetchActivities).toHaveBeenCalled()
    expect(retryProjects).toHaveBeenCalled()
    expect(refetchReceived).toHaveBeenCalled()
  })
})

describe("ProfileOverview: the Account facts", () => {
  it("lists the place, joining, handle and Permanent ID, not the header's type and founding", () => {
    render(
      <ProfileOverview
        did="did:plc:me"
        handle="me.certified.app"
        basePath="/me.certified.app"
        summary={summary()}
        isOrg
        joined="Jun 2026"
        location={{ name: "W8VJ+RPH, Nosara, Costa Rica", shape: null }}
      />,
    )
    const card = screen.getByRole("region", { name: "Account" })
    const text = card.textContent ?? ""
    // The header's meta line names the type and founding.
    expect(text).not.toContain("Type")
    expect(text).not.toContain("Founded")
    // The Plus Code is dropped from the place.
    expect(text).toContain("LocationNosara, Costa Rica")
    expect(text).toContain("JoinedJun 2026")
    expect(text).toContain("Handle@me.certified.app")
    expect(text).toContain("did:plc:me")
    expect(within(card).getByRole("button", { name: "Copy Permanent ID" })).toBeTruthy()
  })

  it("leaves out a handle that is only the DID", () => {
    render(
      <ProfileOverview
        did="did:plc:me"
        handle="did:plc:me"
        basePath="/did:plc:me"
        summary={summary()}
      />,
    )
    const card = screen.getByRole("region", { name: "Account" })
    expect(card.textContent).not.toContain("Handle")
  })
})
