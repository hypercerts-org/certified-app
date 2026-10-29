// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { Agent } from "undici"

/**
 * SSRF guard (TECH-811). Real loopback HTTP servers: a refused target must
 * fail before any connection is opened, not merely return an error.
 */

import {
  SsrfBlockedError,
  createGuardedAgent,
  guardedFetch,
  isPublicAddress,
} from "../ssrf"

let server: http.Server
let port = 0
let connections = 0

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url?.startsWith("/redirect?to=")) {
      res.writeHead(302, { location: decodeURIComponent(req.url.slice("/redirect?to=".length)) })
      return res.end()
    }
    res.end("internal secret")
  })
  server.on("connection", () => {
    connections++
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** The SsrfBlockedError behind fetch's TypeError("fetch failed"), if any. */
async function blockedCause(p: Promise<Response>): Promise<unknown> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  )
  let cause = err
  while (cause && !(cause instanceof SsrfBlockedError)) cause = (cause as Error).cause
  return cause
}

describe("isPublicAddress", () => {
  it.each([
    ["8.8.8.8", true],
    ["2606:4700::1111", true],
    ["::ffff:8.8.8.8", true],
    ["10.1.2.3", false],
    ["172.16.0.1", false],
    ["192.168.1.1", false],
    ["127.0.0.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["192.0.2.1", false],
    ["198.18.0.1", false],
    ["224.0.0.1", false],
    ["255.255.255.255", false],
    ["::1", false],
    ["::", false],
    ["fe80::1", false],
    ["fd00::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:169.254.169.254", false],
    ["64:ff9b::7f00:1", false],
    ["2002:7f00:1::", false],
    ["2001:db8::1", false],
    ["not-an-ip", false],
  ])("%s → %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected)
  })
})

describe("guarded dispatcher (real connections)", () => {
  it("refuses a literal loopback IP before connecting", async () => {
    const before = connections
    const cause = await blockedCause(
      fetch(`http://127.0.0.1:${port}/`, { dispatcher: createGuardedAgent() } as RequestInit),
    )
    expect(cause).toBeInstanceOf(SsrfBlockedError)
    expect(connections).toBe(before)
  })

  it("refuses a hostname that resolves to loopback", async () => {
    const before = connections
    const cause = await blockedCause(
      fetch(`http://localhost:${port}/`, { dispatcher: createGuardedAgent() } as RequestInit),
    )
    expect(cause).toBeInstanceOf(SsrfBlockedError)
    expect(connections).toBe(before)
  })

  it("connects to an allowed address", async () => {
    const onlyThisServer = createGuardedAgent((a) => a === "127.0.0.1")
    const res = await fetch(`http://127.0.0.1:${port}/`, { dispatcher: onlyThisServer } as RequestInit)
    expect(await res.text()).toBe("internal secret")
  })

  it.each([
    ["a literal IP", () => `http://127.0.0.2:${port}/`],
    ["a hostname with a refused address", () => `http://localhost:${port}/`],
  ])("re-checks every redirect hop: %s", async (_label, target) => {
    // Only the first server is allowed; the hop it redirects to is not.
    const onlyThisServer = createGuardedAgent((a) => a === "127.0.0.1")
    const cause = await blockedCause(
      fetch(`http://127.0.0.1:${port}/redirect?to=${encodeURIComponent(target())}`, {
        dispatcher: onlyThisServer,
      } as RequestInit),
    )
    expect(cause).toBeInstanceOf(SsrfBlockedError)
  })
})

describe("guardedFetch", () => {
  it("refuses an internal target for real", async () => {
    const before = connections
    const cause = await blockedCause(guardedFetch(`http://127.0.0.1:${port}/`))
    expect(cause).toBeInstanceOf(SsrfBlockedError)
    expect(connections).toBe(before)
  })

  it("passes the guarded dispatcher on init, keeping the caller's options", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"))
    const signal = AbortSignal.timeout(1_000)
    await guardedFetch("https://pds.example/xrpc/x", { method: "POST", redirect: "error", signal })

    const [url, init] = spy.mock.calls[0]
    expect(url).toBe("https://pds.example/xrpc/x")
    expect(init).toMatchObject({ method: "POST", redirect: "error", signal })
    expect((init as { dispatcher?: unknown }).dispatcher).toBeInstanceOf(Agent)
  })

  it("can be switched off for local development only", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"))
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")

    vi.stubEnv("NODE_ENV", "development")
    await guardedFetch("http://192.168.1.10/xrpc/x")
    expect((spy.mock.calls[0][1] as { dispatcher?: unknown } | undefined)?.dispatcher).toBeUndefined()

    vi.stubEnv("NODE_ENV", "production")
    await guardedFetch("https://pds.example/xrpc/x")
    expect((spy.mock.calls[1][1] as { dispatcher?: unknown }).dispatcher).toBeInstanceOf(Agent)
  })
})
