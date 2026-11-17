import { describe, it, expect } from "vitest"
import { visibleProfileTabs, type ProfileTabKey } from "../profile-tab-set"
import type { ProfileSummary, SectionCount } from "../use-profile-summary"

const n = (value: number): SectionCount => ({ value, isLoading: false, failed: false })
const loading: SectionCount = { value: null, isLoading: true, failed: false }

function counts(over: Partial<ProfileSummary["counts"]> = {}): ProfileSummary["counts"] {
  return {
    activities: n(3),
    projects: n(1),
    endorsements: n(2),
    endorsementsReceived: n(2),
    followers: n(5),
    lists: n(0),
    endorsementsGiven: 0,
    following: 0,
    ...over,
  }
}

function keys(opts: {
  counts?: ProfileSummary["counts"]
  tab?: ProfileTabKey
  owner?: boolean
  org?: boolean
  editing?: boolean
}): string[] {
  return visibleProfileTabs({
    counts: opts.counts ?? counts(),
    tabFromUrl: opts.tab ?? "overview",
    isViewerThisEntity: !!opts.owner,
    isActiveIdentityThisProfile: !!opts.owner,
    isOrg: !!opts.org,
    editing: !!opts.editing,
  }).map((t) => t.key)
}

describe("visibleProfileTabs", () => {
  it("gives a visitor only the sections with something in them", () => {
    expect(keys({})).toEqual(["overview", "activities", "projects", "endorsements", "followers"])
  })

  it("gives the account itself the visitor's tabs: no Groups, About or empty Lists", () => {
    expect(keys({ owner: true })).toEqual(keys({}))
    expect(keys({ owner: true, org: true })).toEqual(keys({}))
  })

  it("keeps a tab a link opened for the account itself, and only for it", () => {
    expect(keys({ owner: true, tab: "lists" })).toContain("lists")
    expect(keys({ owner: true, tab: "groups" })).toContain("groups")
    expect(keys({ owner: true, org: true, tab: "about" })).toContain("about")
    // A person has no About; a visitor gets none of them.
    expect(keys({ owner: true, tab: "about" })).not.toContain("about")
    expect(keys({ tab: "lists" })).not.toContain("lists")
    expect(keys({ tab: "groups" })).not.toContain("groups")
  })

  it("shows About to an organization while it edits, with the other tabs off", () => {
    const tabs = visibleProfileTabs({
      counts: counts(),
      tabFromUrl: "overview",
      isViewerThisEntity: true,
      isActiveIdentityThisProfile: true,
      isOrg: true,
      editing: true,
    })
    expect(tabs.map((t) => t.key)).toContain("about")
    expect(tabs.filter((t) => !t.disabled).map((t) => t.key)).toEqual(["overview", "about"])
  })

  it("never hides a section while it is loading or failed", () => {
    const c = counts({ lists: loading, activities: { value: null, isLoading: false, failed: true } })
    expect(keys({ counts: c })).toEqual(expect.arrayContaining(["activities", "lists"]))
  })

  it("keeps Endorsements and Followers for what was given or followed", () => {
    const c = counts({ endorsements: n(0), followers: n(0), endorsementsGiven: 2, following: 1 })
    expect(keys({ counts: c })).toEqual(expect.arrayContaining(["endorsements", "followers"]))
  })

  it("labels the counts", () => {
    const tabs = visibleProfileTabs({
      counts: counts({ activities: { value: 40, more: true, isLoading: false, failed: false } }),
      tabFromUrl: "overview",
      isViewerThisEntity: false,
      isActiveIdentityThisProfile: false,
      isOrg: false,
      editing: false,
    })
    expect(tabs.find((t) => t.key === "activities")?.count).toBe("40+")
    expect(tabs.find((t) => t.key === "overview")?.count).toBeUndefined()
  })
})
