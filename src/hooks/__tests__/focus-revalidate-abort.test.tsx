import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"

// quality-032 / hooks-fetch-3: the window-focus revalidation handlers in
// useReceivedEndorsements, useProfileResponses, and useBlueskyFollows fire
// their fetch path with no AbortSignal. That means the in-flight focus fetch
// can never be cancelled on unmount/next focus — the `if (signal?.aborted)`
// guard is always false, so a focus event near unmount can setState after the
// hook is gone. The fix gives each focus handler its own ref'd AbortController
// aborted on cleanup, so the focus fetch DOES carry an abortable signal.
//
// Each suite mocks the network leaf so the focus fetch's signal is captured,
// then asserts: (a) the focus fetch carries a real, not-yet-aborted signal,
// and (b) unmount aborts it. Pre-fix the captured signal is `undefined`, so
// (a) fails — red for the right reason.

// --- useBlueskyFollows ------------------------------------------------------
// No singleflight in this hook, so a focus fetch fires even while the mount
// fetch is still in-flight (cache stays cold until the first one resolves).
const authFetchCalls: { signal: AbortSignal | undefined }[] = []
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>(() => {
        // Never resolves — keeps the fetch in-flight so we can inspect its
        // signal and prove unmount aborts it.
        authFetchCalls.push({ signal: init?.signal ?? undefined })
      }),
  ),
  setOnUnauthorized: vi.fn(),
}))

// --- useProfileResponses ----------------------------------------------------
// This hook de-dups concurrent loads per DID (singleflight) and skips fresh
// fetches inside STALE_MS, so the test resolves the mount fetch, advances past
// the stale window with fake timers, then focuses to force a brand-new fetch.
interface PendingResp {
  signal: AbortSignal | undefined
  resolve: (value: unknown[]) => void
}
const listResponsesCalls: PendingResp[] = []
vi.mock("@/lib/atproto/badges", () => ({
  listResponses: vi.fn(
    (_did: string, signal?: AbortSignal) =>
      new Promise<unknown[]>((resolve) => {
        listResponsesCalls.push({ signal: signal ?? undefined, resolve })
      }),
  ),
}))

import { useBlueskyFollows } from "../use-bluesky-follows"
import { useProfileResponses } from "../use-profile-responses"

function dispatchFocus() {
  window.dispatchEvent(new Event("focus"))
}

beforeEach(() => {
  cleanup()
  authFetchCalls.length = 0
  listResponsesCalls.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useBlueskyFollows — focus revalidation carries an abortable signal", () => {
  it("aborts the focus-triggered fetch on unmount", async () => {
    const { unmount } = renderHook(() => useBlueskyFollows("did:plc:follows-1"))

    // Mount fetch (call #1) is in-flight (mock never resolves), so the cache
    // stays cold — the focus handler will see a missing entry and fetch again.
    await waitFor(() => expect(authFetchCalls.length).toBe(1))

    act(() => {
      dispatchFocus()
    })
    await waitFor(() => expect(authFetchCalls.length).toBe(2))

    const focusCall = authFetchCalls[1]
    // Pre-fix: the focus handler passes no signal, so this is undefined.
    expect(focusCall.signal).toBeDefined()
    expect(focusCall.signal!.aborted).toBe(false)

    unmount()
    expect(focusCall.signal!.aborted).toBe(true)
  })
})

describe("useProfileResponses — focus revalidation carries an abortable signal", () => {
  it("aborts the focus-triggered fetch on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const { unmount } = renderHook(() => useProfileResponses("did:plc:resp-1"))

    // Mount fetch (call #1). Resolve it so the singleflight entry clears and a
    // later focus is free to start a fresh fetch.
    await waitFor(() => expect(listResponsesCalls.length).toBe(1))
    await act(async () => {
      listResponsesCalls[0].resolve([])
    })

    // Advance past STALE_MS (5 min) so the focus handler treats the cache as
    // stale and refetches rather than short-circuiting.
    await act(async () => {
      vi.advanceTimersByTime(6 * 60 * 1000)
    })

    act(() => {
      dispatchFocus()
    })
    await waitFor(() => expect(listResponsesCalls.length).toBe(2))

    const focusCall = listResponsesCalls[1]
    expect(focusCall.signal).toBeDefined()
    expect(focusCall.signal!.aborted).toBe(false)

    unmount()
    expect(focusCall.signal!.aborted).toBe(true)
  })
})
