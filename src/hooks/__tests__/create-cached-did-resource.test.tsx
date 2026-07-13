import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"
import { createCachedDidResource } from "../create-cached-did-resource"

// Each test builds its own resource (the factory owns per-resource
// cache + inflight maps), so there is no cross-test module state.

const STALE_MS = 5 * 60 * 1000

beforeEach(() => {
  cleanup()
})

describe("createCachedDidResource — singleflight", () => {
  it("shares one fetch across simultaneous mounts for the same DID", async () => {
    let resolveFetch: (v: string[]) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const useResource = createCachedDidResource<string[]>({
      staleMs: STALE_MS,
      fetch: fetcher,
      onError: "reset",
      errorFallback: "failed",
    })

    const a = renderHook(() => useResource("did:plc:one"))
    const b = renderHook(() => useResource("did:plc:one"))

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await act(async () => {
      resolveFetch(["x"])
    })

    await waitFor(() => {
      expect(a.result.current.data).toEqual(["x"])
      expect(b.result.current.data).toEqual(["x"])
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("one consumer unmounting does not fail its sibling", async () => {
    let resolveFetch: (v: number) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const useResource = createCachedDidResource<number>({
      staleMs: STALE_MS,
      fetch: fetcher,
      onError: "reset",
      errorFallback: "failed",
    })

    const a = renderHook(() => useResource("did:plc:two"))
    const b = renderHook(() => useResource("did:plc:two"))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    // The shared promise must not be bound to the first caller's
    // AbortSignal — its unmount only suppresses its own setState.
    a.unmount()
    await act(async () => {
      resolveFetch(7)
    })

    await waitFor(() => expect(b.result.current.data).toBe(7))
    expect(b.result.current.error).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("serves the fresh cache to re-mounts without refetching", async () => {
    const fetcher = vi.fn(async () => "value")
    const useResource = createCachedDidResource<string>({
      staleMs: STALE_MS,
      fetch: fetcher,
      onError: "reset",
      errorFallback: "failed",
    })

    const first = renderHook(() => useResource("did:plc:three"))
    await waitFor(() => expect(first.result.current.data).toBe("value"))
    first.unmount()

    const second = renderHook(() => useResource("did:plc:three"))
    await waitFor(() => expect(second.result.current.data).toBe("value"))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("refetch bypasses the cache AND a pending in-flight fetch", async () => {
    const resolvers: ((v: string) => void)[] = []
    const fetcher = vi.fn(
      (_did: string, _opts: { force: boolean }) =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const useResource = createCachedDidResource<string>({
      staleMs: STALE_MS,
      fetch: fetcher,
      onError: "reset",
      errorFallback: "failed",
    })

    const hook = renderHook(() => useResource("did:plc:four"))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    // Refetch while the mount fetch is still pending: it must start a
    // brand-new forced fetch rather than joining the stale one.
    let refetchPromise: Promise<void> = Promise.resolve()
    act(() => {
      refetchPromise = hook.result.current.refetch()
    })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(fetcher.mock.calls[1][1]).toEqual({ force: true })

    await act(async () => {
      resolvers[1]("fresh")
      await refetchPromise
    })
    expect(hook.result.current.data).toBe("fresh")

    // The superseded pre-refetch fetch settling late must NOT clobber
    // the cache: a new mount reads "fresh" without another fetch.
    await act(async () => {
      resolvers[0]("stale")
    })
    const second = renderHook(() => useResource("did:plc:four"))
    await waitFor(() => expect(second.result.current.data).toBe("fresh"))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe("createCachedDidResource — error policy", () => {
  function failingSecondFetch(): ReturnType<typeof vi.fn> {
    let calls = 0
    return vi.fn(async () => {
      calls++
      if (calls === 1) return "ok"
      throw new Error("boom")
    })
  }

  it('"reset" drops the previous value on failure', async () => {
    const useResource = createCachedDidResource<string>({
      staleMs: STALE_MS,
      fetch: failingSecondFetch() as (did: string, opts: { force: boolean }) => Promise<string>,
      onError: "reset",
      errorFallback: "failed",
    })
    const hook = renderHook(() => useResource("did:plc:reset"))
    await waitFor(() => expect(hook.result.current.data).toBe("ok"))

    await act(async () => {
      await hook.result.current.refetch()
    })
    expect(hook.result.current.error).toBe("boom")
    expect(hook.result.current.data).toBeNull()
  })

  it('"retain" keeps the previous value next to the error', async () => {
    const useResource = createCachedDidResource<string>({
      staleMs: STALE_MS,
      fetch: failingSecondFetch() as (did: string, opts: { force: boolean }) => Promise<string>,
      onError: "retain",
      errorFallback: "failed",
    })
    const hook = renderHook(() => useResource("did:plc:retain"))
    await waitFor(() => expect(hook.result.current.data).toBe("ok"))

    await act(async () => {
      await hook.result.current.refetch()
    })
    expect(hook.result.current.error).toBe("boom")
    expect(hook.result.current.data).toBe("ok")
  })
})

describe("createCachedDidResource — mutate", () => {
  it("writes through to the module cache so re-mounts see the mutation", async () => {
    const fetcher = vi.fn(async () => ["a"])
    const useResource = createCachedDidResource<string[]>({
      staleMs: STALE_MS,
      fetch: fetcher,
      onError: "reset",
      errorFallback: "failed",
    })

    const first = renderHook(() => useResource("did:plc:mutate"))
    await waitFor(() => expect(first.result.current.data).toEqual(["a"]))

    act(() => {
      first.result.current.mutate((prev) => ["b", ...(prev ?? [])])
    })
    expect(first.result.current.data).toEqual(["b", "a"])
    first.unmount()

    const second = renderHook(() => useResource("did:plc:mutate"))
    await waitFor(() => expect(second.result.current.data).toEqual(["b", "a"]))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("returns the empty state for a null DID without fetching", async () => {
    const fetcher = vi.fn(async () => "never")
    const useResource = createCachedDidResource<string>({
      staleMs: STALE_MS,
      fetch: fetcher,
      onError: "reset",
      errorFallback: "failed",
    })
    const hook = renderHook(() => useResource(null))
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    expect(hook.result.current.data).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
