import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook, render, cleanup } from "@testing-library/react"
import type { Group } from "@/lib/groups/types"
import type { PostingIdentity } from "@/lib/groups/posting-identity"
import { buildPostingOptions } from "@/lib/groups/posting-identity"

/**
 * posting-as default: the per-action write picker must ALWAYS default to
 * the personal "You" identity — never to the active org and never to a
 * last-used group. The org-identity write model is per-action: each
 * action starts from the safe personal default and the user opts into a
 * group explicitly. These tests pin that invariant at three levels:
 *
 *   1. buildPostingOptions(viewer, groups) → You is first, kind personal.
 *   2. usePostingIdentity().value defaults to You even when an active org
 *      is set (the active-org is a red herring the hook must ignore).
 *   3. <PostingAs> with a single option renders the static "Posting as
 *      You" label (no menu).
 */

const VIEWER_DID = "did:plc:viewer"
const GROUP_DID = "did:plc:group"

// An "active org" that the hook MUST NOT adopt as the default. If the
// picker ever regressed to seeding from activeOrg, value.did would equal
// this and value.kind would be "group" — which the assertions below
// reject.
const activeOrg: Group = {
  groupDid: GROUP_DID,
  handle: "acme.example.com",
  displayName: "Acme",
  role: "owner",
  accepted: true,
}

const groups: Group[] = [activeOrg]

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: VIEWER_DID, isAuthenticated: true }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  // activeOrg is deliberately the group — the hook must still default to
  // You. groups feeds the option list (You + this writable group).
  useOrg: () => ({ activeOrg, groups }),
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({
    info: { did: VIEWER_DID, handle: "viewer.example.com", displayName: null, avatarUrl: null },
    isLoading: false,
    error: null,
  }),
}))

afterEach(() => {
  cleanup()
})

describe("buildPostingOptions", () => {
  it("puts You first as the personal identity", () => {
    const opts = buildPostingOptions({ did: VIEWER_DID }, groups)
    expect(opts[0].kind).toBe("personal")
    expect(opts[0].did).toBe(VIEWER_DID)
    expect(opts[0].label).toBe("You")
  })

  it("appends writable groups after You (never before)", () => {
    const opts = buildPostingOptions({ did: VIEWER_DID }, groups)
    expect(opts).toHaveLength(2)
    expect(opts[1].kind).toBe("group")
    expect(opts[1].did).toBe(GROUP_DID)
  })

  it("includes You even when the viewer has no groups", () => {
    const opts = buildPostingOptions({ did: VIEWER_DID }, [])
    expect(opts).toHaveLength(1)
    expect(opts[0].kind).toBe("personal")
  })
})

describe("usePostingIdentity default", () => {
  it("defaults value to the personal You identity, not the active org", async () => {
    const { usePostingIdentity } = await import("@/hooks/use-posting-identity")
    const { result } = renderHook(() => usePostingIdentity())

    // The default must be personal You — NOT the active org's group.
    expect(result.current.value.kind).toBe("personal")
    expect(result.current.value.did).toBe(VIEWER_DID)
    expect(result.current.value.did).not.toBe(GROUP_DID)
  })

  it("still surfaces the writable group as a selectable option", async () => {
    const { usePostingIdentity } = await import("@/hooks/use-posting-identity")
    const { result } = renderHook(() => usePostingIdentity())

    // The group is available to pick — it's just not the default.
    expect(result.current.options.some((o) => o.did === GROUP_DID)).toBe(true)
    expect(result.current.options[0].kind).toBe("personal")
  })
})

describe("<PostingAs> single-option label", () => {
  it("renders a static 'Posting as You' label when You is the only option", async () => {
    const { default: PostingAs } = await import("@/components/create/posting-as")
    const you: PostingIdentity = {
      did: VIEWER_DID,
      kind: "personal",
      label: "You",
    }
    const { container, queryByRole } = render(
      <PostingAs value={you} onChange={() => {}} options={[you]} />,
    )
    // No interactive trigger / menu when there's nothing to pick.
    expect(queryByRole("button")).toBeNull()
    expect(container.textContent).toContain("Posting as")
    expect(container.textContent).toContain("You")
  })
})
