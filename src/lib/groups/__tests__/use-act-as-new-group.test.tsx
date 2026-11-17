import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import type { Group } from "../types"

const state = {
  groups: [] as Group[],
  switchOrg: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me" }),
}))

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: state.toast }),
}))

vi.mock("../org-context", () => ({
  useOrg: () => ({ groups: state.groups, switchOrg: state.switchOrg }),
}))

import { useActAsNewGroup } from "../use-act-as-new-group"

const ESTUARY: Group = {
  groupDid: "did:plc:estuary",
  handle: "estuary.certified.app",
  displayName: "Estuary Alliance",
  role: "owner",
  accepted: true,
}

beforeEach(() => {
  state.groups = []
  state.switchOrg.mockReset()
  state.push.mockReset()
  state.toast.mockReset()
})

describe("useActAsNewGroup", () => {
  it("acts as the new group from the refetched list, opens its Overview and says so", () => {
    state.groups = [ESTUARY]
    const { result } = renderHook(() => useActAsNewGroup())
    act(() => result.current({ groupDid: ESTUARY.groupDid, name: "Estuary Alliance" }))
    expect(state.switchOrg).toHaveBeenCalledWith(ESTUARY)
    expect(state.push).toHaveBeenCalledWith("/home")
    expect(state.toast).toHaveBeenCalledWith({
      title: "Created Estuary Alliance",
      description: "You're acting as it now.",
      variant: "success",
    })
  })

  it("while the list doesn't have it yet, stays personal but still opens the Overview", () => {
    const { result } = renderHook(() => useActAsNewGroup())
    act(() => result.current({ groupDid: ESTUARY.groupDid, name: "Estuary Alliance" }))
    expect(state.switchOrg).not.toHaveBeenCalled()
    expect(state.push).toHaveBeenCalledWith("/home")
    expect(state.toast).toHaveBeenCalledWith({
      title: "Created Estuary Alliance",
      description: undefined,
      variant: "success",
    })
  })

  it("an imported account is your own: nothing to switch to", () => {
    const { result } = renderHook(() => useActAsNewGroup())
    act(() => result.current({ groupDid: "did:plc:me", name: "@me.certified.app" }))
    expect(state.switchOrg).not.toHaveBeenCalled()
    expect(state.push).toHaveBeenCalledWith("/home")
    expect(state.toast).toHaveBeenCalledWith({
      title: "Turned @me.certified.app into a group",
      variant: "success",
    })
  })

  it("does it once per call", () => {
    state.groups = [ESTUARY]
    const { result, rerender } = renderHook(() => useActAsNewGroup())
    act(() => result.current({ groupDid: ESTUARY.groupDid, name: "Estuary Alliance" }))
    rerender()
    expect(state.push).toHaveBeenCalledTimes(1)
    expect(state.toast).toHaveBeenCalledTimes(1)
  })
})
