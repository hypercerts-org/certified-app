import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook, cleanup, waitFor } from "@testing-library/react"
import React from "react"

/**
 * Signed out, the groups pages (/groups/create, /groups/import) wait on
 * `useOrg().isLoading` and `useOrgCreationLimit().isChecking` before
 * rendering anything. Both must settle to false, or the page sits on its
 * spinner forever instead of showing the sign-in prompt.
 */

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, did: null }),
}))

const resolveGroups = vi.fn()
const getSelfCreatedOrgCount = vi.fn()
vi.mock("@/lib/groups/api", () => ({
  resolveGroups: (...a: unknown[]) => resolveGroups(...a),
  getSelfCreatedOrgCount: (...a: unknown[]) => getSelfCreatedOrgCount(...a),
}))

import { OrgProvider, useOrg } from "../org-context"
import { useOrgCreationLimit } from "../use-org-limit"

function wrapper({ children }: { children: React.ReactNode }) {
  return <OrgProvider>{children}</OrgProvider>
}

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe("groups loading state when signed out", () => {
  it("the org list settles without fetching", async () => {
    const { result } = renderHook(() => useOrg(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.groups).toEqual([])
    expect(resolveGroups).not.toHaveBeenCalled()
  })

  it("the creation-limit check settles without fetching", async () => {
    const { result } = renderHook(() => useOrgCreationLimit(), { wrapper })

    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.limitReached).toBe(false)
    expect(getSelfCreatedOrgCount).not.toHaveBeenCalled()
  })
})
