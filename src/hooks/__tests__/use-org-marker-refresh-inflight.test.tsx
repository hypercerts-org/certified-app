import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"

// Controllable mock of authFetch. Each call records its requested DID and
// returns a deferred Response we resolve by hand, so a test can hold a
// fetch in-flight while a second consumer triggers refresh().
interface PendingFetch {
  did: string
  resolve: (value: Response) => void
}

const calls: PendingFetch[] = []

vi.mock("@/lib/auth/fetch", () => ({
  authFetch: vi.fn((input: string) => {
    const url = new URL(input, "http://localhost")
    const did = url.searchParams.get("repo") ?? ""
    return new Promise<Response>((resolve) => {
      calls.push({ did, resolve })
    })
  }),
}))

import { useOrgMarker } from "../use-org-marker"

/** Build a minimal getRecord OK Response carrying an org marker value. */
function okResponse(value: unknown): Response {
  return {
    status: 200,
    ok: true,
    json: async () => ({ value }),
    clone() {
      return this
    },
  } as unknown as Response
}

/** Resolve the oldest still-pending authFetch matching the predicate. */
function resolveCall(match: (c: PendingFetch) => boolean, value: Response) {
  const idx = calls.findIndex(match)
  if (idx === -1) throw new Error("no matching pending authFetch call")
  const [call] = calls.splice(idx, 1)
  call.resolve(value)
}

beforeEach(() => {
  cleanup()
  calls.length = 0
})

describe("useOrgMarker — refresh() during a concurrent in-flight fetch", () => {
  it("issues a fresh network fetch and observes the post-refresh value", async () => {
    // Unique DID so the module-level cache/in-flight maps don't collide
    // with other tests in the same worker.
    const did = "did:refresh:inflight:1"

    // Consumer A mounts and kicks off a fetch — held in-flight (not resolved).
    const a = renderHook(() => useOrgMarker(did))
    await waitFor(() => expect(calls.some((c) => c.did === did)).toBe(true))
    expect(calls.filter((c) => c.did === did)).toHaveLength(1)

    // Consumer B (the editor) mounts; it dedupes onto A's in-flight promise,
    // so still only one network call so far.
    const b = renderHook(() => useOrgMarker(did))
    expect(calls.filter((c) => c.did === did)).toHaveLength(1)

    // The editor saved a new record and calls refresh(). With the bug,
    // refresh only evicts the cache but leaves the in-flight promise
    // registered, so no new network fetch is issued and B re-reads the
    // stale pre-refresh value once the old promise resolves.
    act(() => {
      b.result.current.refresh()
    })

    // Correct behavior: refresh clears the in-flight dedupe, so a brand-new
    // network fetch must be issued for the DID.
    await waitFor(() =>
      expect(calls.filter((c) => c.did === did)).toHaveLength(2),
    )

    // Resolve the original (pre-refresh) in-flight fetch with the OLD record.
    await act(async () => {
      resolveCall(
        (c) => c.did === did,
        okResponse({ urls: [{ url: "https://old.example" }] }),
      )
    })

    // Resolve the refresh-triggered fetch with the NEW record.
    await act(async () => {
      resolveCall(
        (c) => c.did === did,
        okResponse({ urls: [{ url: "https://new.example" }] }),
      )
    })

    // The refreshed consumer must observe the post-refresh value, not the
    // stale one resolved by the original in-flight promise.
    await waitFor(() =>
      expect(b.result.current.additionalUrls).toEqual(["https://new.example"]),
    )
    expect(b.result.current.isOrg).toBe(true)
  })
})
