import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act, cleanup, waitFor } from "@testing-library/react"
import React from "react"

/**
 * Tests for the sessionStorage restore in OrgProvider. The persisted
 * active-org payload can predate a Group schema change (or be tampered
 * with), so `loadPersistedOrg` must field-validate before installing it as
 * `activeOrg` — an org without a string `groupDid` would otherwise drive
 * /api/groups/undefined/... requests until fetchOrgs reconciles.
 *
 * `resolveGroups` is mocked to never resolve so the restore path is
 * observed before reconciliation can overwrite it.
 */

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    did: "did:plc:viewer0000000000000000",
  }),
}))

const resolveGroups = vi.fn()
vi.mock("@/lib/groups/api", () => ({
  resolveGroups: (...a: unknown[]) => resolveGroups(...a),
}))

import { OrgProvider, useOrg } from "../org-context"

const ACTIVE_ORG_KEY = "certified_active_org"

const validOrg = {
  groupDid: "did:plc:orgaaaaaaaaaaaaaaaaaaa1",
  handle: "org.example.com",
  role: "member",
  accepted: true,
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <OrgProvider>{children}</OrgProvider>
}

beforeEach(() => {
  window.sessionStorage.clear()
  resolveGroups.mockReset()
  resolveGroups.mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe("OrgProvider — persisted active-org validation", () => {
  it("restores a well-formed persisted org", async () => {
    window.sessionStorage.setItem(ACTIVE_ORG_KEY, JSON.stringify(validOrg))

    const { result } = renderHook(() => useOrg(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeOrg?.groupDid).toBe(validOrg.groupDid),
    )
    expect(result.current.activeOrg?.handle).toBe(validOrg.handle)
  })

  it.each([
    ["missing groupDid", JSON.stringify({ handle: "org.example.com" })],
    ["non-string groupDid", JSON.stringify({ ...validOrg, groupDid: 42 })],
    ["groupDid without did: prefix", JSON.stringify({ ...validOrg, groupDid: "not-a-did" })],
    ["missing handle", JSON.stringify({ groupDid: validOrg.groupDid })],
    ["non-object payload", JSON.stringify("just a string")],
    ["null payload", "null"],
    ["corrupt JSON", "{not json"],
  ])("ignores a persisted org with %s", async (_label, raw) => {
    window.sessionStorage.setItem(ACTIVE_ORG_KEY, raw)

    const { result } = renderHook(() => useOrg(), { wrapper })

    // Flush the mount-time restore effect; a bogus payload must never
    // become activeOrg.
    await act(async () => {})
    expect(result.current.activeOrg).toBeNull()
  })
})
