import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act, cleanup } from "@testing-library/react"
import type { ResolveOutcome } from "@/lib/atproto/resolve-did-batch"

/**
 * A failed lookup is not "an account without a name": the hook retries it
 * with backoff (honouring Retry-After) while it stays loading, and only
 * then reports `failed`, with `retry()`. An identity the server says
 * doesn't resolve is a fact, not a failure.
 */

const load = vi.fn<(did: string, opts?: { retry?: boolean }) => Promise<ResolveOutcome>>()
vi.mock("@/lib/atproto/resolve-did-batch", () => ({
  loadResolvedProfileOutcome: (did: string, opts?: { retry?: boolean }) => load(did, opts),
}))

import {
  useAuthorInfo,
  AUTHOR_RETRY_DELAYS_MS,
  AUTHOR_LOAD_ERROR,
} from "../use-author-info"

const failed = (retryAfterMs: number | null = null): ResolveOutcome => ({
  status: "failed",
  retryAfterMs,
})
const ok: ResolveOutcome = {
  status: "ok",
  profile: { did: "did:plc:a", handle: "a.test", displayName: "Ada" },
}

/** Let the hook's promise callbacks run. */
const flush = () => act(async () => {})

beforeEach(() => {
  vi.useFakeTimers()
  load.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useAuthorInfo", () => {
  it("resolves a profile", async () => {
    load.mockResolvedValue(ok)
    const { result } = renderHook(() => useAuthorInfo("did:plc:a"))
    expect(result.current.isLoading).toBe(true)
    await flush()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.failed).toBe(false)
    expect(result.current.info?.displayName).toBe("Ada")
    expect(load).toHaveBeenCalledWith("did:plc:a", { retry: false })
  })

  it("treats an identity that doesn't resolve as a fact, without retrying", async () => {
    load.mockResolvedValue({ status: "missing" })
    const { result } = renderHook(() => useAuthorInfo("did:plc:a"))
    await flush()
    expect(result.current.failed).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.info).toMatchObject({ did: "did:plc:a", displayName: null })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("retries a failed lookup with backoff, staying loading, and recovers", async () => {
    load.mockResolvedValueOnce(failed()).mockResolvedValueOnce(failed()).mockResolvedValue(ok)
    const { result } = renderHook(() => useAuthorInfo("did:plc:a"))
    await flush()
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.failed).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTHOR_RETRY_DELAYS_MS[0])
    })
    expect(load).toHaveBeenCalledTimes(2)
    // Every retry replaces the cached failure.
    expect(load).toHaveBeenLastCalledWith("did:plc:a", { retry: true })
    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTHOR_RETRY_DELAYS_MS[1])
    })
    expect(load).toHaveBeenCalledTimes(3)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.failed).toBe(false)
    expect(result.current.info?.displayName).toBe("Ada")
  })

  it("reports failed after its retries, and tries again on retry()", async () => {
    load.mockResolvedValue(failed())
    const { result } = renderHook(() => useAuthorInfo("did:plc:a"))
    await flush()
    for (const delay of AUTHOR_RETRY_DELAYS_MS) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay)
      })
    }
    expect(load).toHaveBeenCalledTimes(AUTHOR_RETRY_DELAYS_MS.length + 1)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.failed).toBe(true)
    expect(result.current.error).toBe(AUTHOR_LOAD_ERROR)
    // Callers that don't look at `failed` keep the old DID-only fallback.
    expect(result.current.info).toMatchObject({ did: "did:plc:a", displayName: null })

    load.mockResolvedValue(ok)
    act(() => result.current.retry())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.failed).toBe(false)
    await flush()
    expect(load).toHaveBeenLastCalledWith("did:plc:a", { retry: true })
    expect(result.current.failed).toBe(false)
    expect(result.current.info?.displayName).toBe("Ada")
  })

  it("waits out a Retry-After longer than the backoff step", async () => {
    load.mockResolvedValueOnce(failed(8_000)).mockResolvedValue(ok)
    const { result } = renderHook(() => useAuthorInfo("did:plc:a"))
    await flush()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTHOR_RETRY_DELAYS_MS[0])
    })
    // Not yet: the server asked for 8 seconds.
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000 - AUTHOR_RETRY_DELAYS_MS[0])
    })
    expect(load).toHaveBeenCalledTimes(2)
    expect(result.current.info?.displayName).toBe("Ada")
  })

  it("shows the failure at once when Retry-After is too long to wait with a placeholder", async () => {
    load.mockResolvedValue(failed(60_000))
    const { result } = renderHook(() => useAuthorInfo("did:plc:a"))
    await flush()
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.failed).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })

  it("stops retrying when the DID changes or the component unmounts", async () => {
    load.mockResolvedValue(failed())
    const { unmount } = renderHook(() => useAuthorInfo("did:plc:a"))
    await flush()
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(load).toHaveBeenCalledTimes(1)
  })
})
