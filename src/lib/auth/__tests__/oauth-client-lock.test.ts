import { describe, it, expect, vi } from "vitest"

const { NodeOAuthClient } = vi.hoisted(() => ({ NodeOAuthClient: vi.fn() }))
vi.mock("@atproto/oauth-client-node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@atproto/oauth-client-node")>()),
  NodeOAuthClient,
}))
vi.mock("@/lib/auth/stores", () => ({
  getRedis: vi.fn(),
  RedisStateStore: class {},
  RedisSessionStore: class {},
}))

import { getOAuthClient } from "../oauth-client"
import { redisRequestLock } from "../request-lock"

describe("getOAuthClient", () => {
  it("passes the Redis request lock to the OAuth client (TECH-807)", async () => {
    await getOAuthClient()

    expect(NodeOAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({ requestLock: redisRequestLock }),
    )
  })
})
