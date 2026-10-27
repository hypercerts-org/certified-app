// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Agent } from "@atproto/api"

/**
 * `groupServiceFetch` is the single `#createdVia` signing point for group
 * writes: create/put get a signature bound to the group DID; delete and blob
 * uploads pass through untouched; a failing signer never blocks the request.
 */

const KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const GROUP_DID = "did:plc:group000000000000000000"
const CREATED_VIA = "app.certified.signature.defs#createdVia"

vi.mock("@/lib/auth/oauth-client", () => ({ getOAuthClient: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ getSessionDid: vi.fn(), deleteSession: vi.fn() }))
vi.mock("@/lib/atproto/service-auth", () => ({ getServiceAuthToken: vi.fn(async () => "token") }))

const agent = {} as Agent
let fetchSpy: ReturnType<typeof vi.spyOn>

function sentBody(call = 0) {
  const init = fetchSpy.mock.calls[call][1] as RequestInit
  return typeof init.body === "string" ? JSON.parse(init.body) : init.body
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("CREATED_VIA_SIGNING_KEY", KEY_HEX)
  vi.stubEnv("CREATED_VIA_DID", "did:web:certified.app")
  vi.stubEnv("PUBLIC_URL", "https://certified.app")
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.doUnmock("@/lib/atproto/created-via")
})

describe("groupServiceFetch — createdVia", () => {
  it.each(["app.certified.group.repo.createRecord", "app.certified.group.repo.putRecord"])(
    "%s signs the record for the group DID without mutating the caller's body",
    async (nsid) => {
      const { groupServiceFetch } = await import("../proxy-agent")
      const body = {
        repo: GROUP_DID,
        collection: "org.hypercerts.claim.activity",
        rkey: "3abc",
        record: { title: "t", createdAt: "2026-10-27T00:00:00.000Z" },
      }
      const original = structuredClone(body)
      await groupServiceFetch(agent, nsid, { body })

      expect(body).toEqual(original)
      const sent = sentBody()
      expect(sent.repo).toBe(GROUP_DID)
      const [entry] = sent.record.signatures
      expect(entry.$type).toBe(CREATED_VIA)
      expect(entry.key).toBe("did:web:certified.app#created-via")

      // The signature is bound to the group repository.
      const { cidForLex } = await import("@atproto/lex-cbor")
      const { jsonToLex } = await import("@atproto/lex-json")
      const { fromBase64 } = await import("@atproto/lex-data")
      const { Secp256k1Keypair, verifySignature } = await import("@atproto/crypto")
      const { signatures: _s, ...rest } = sent.record
      const cid = await cidForLex(
        jsonToLex({ ...rest, $sig: { $type: CREATED_VIA, key: entry.key, repository: GROUP_DID } }, { strict: true }),
      )
      const didKey = (await Secp256k1Keypair.import(KEY_HEX)).did()
      expect(await verifySignature(didKey, cid.bytes, fromBase64(entry.signature.$bytes))).toBe(true)
    },
  )

  it("passes deleteRecord through unchanged", async () => {
    const { groupServiceFetch } = await import("../proxy-agent")
    const body = { repo: GROUP_DID, collection: "org.hypercerts.claim.activity", rkey: "3abc" }
    await groupServiceFetch(agent, "app.certified.group.repo.deleteRecord", { body })
    expect(sentBody()).toEqual(body)
  })

  it("passes a binary uploadBlob body through unchanged", async () => {
    const { groupServiceFetch } = await import("../proxy-agent")
    const bytes = new Uint8Array([1, 2, 3])
    await groupServiceFetch(agent, "app.certified.group.repo.uploadBlob", {
      query: { repo: GROUP_DID },
      body: bytes,
      encoding: "image/png",
    })
    expect(sentBody()).toBe(bytes)
  })

  it("leaves an unsigned collection (app.bsky.actor.profile) unsigned", async () => {
    const { groupServiceFetch } = await import("../proxy-agent")
    const body = {
      repo: GROUP_DID,
      collection: "app.bsky.actor.profile",
      rkey: "self",
      record: { $type: "app.bsky.actor.profile", displayName: "Group" },
    }
    await groupServiceFetch(agent, "app.certified.group.repo.putRecord", { body })
    expect(sentBody()).toEqual(body)
  })

  it("passes a body without a string collection through unchanged", async () => {
    const { groupServiceFetch } = await import("../proxy-agent")
    const body = { repo: GROUP_DID, rkey: "3abc", record: { title: "t" } }
    await groupServiceFetch(agent, "app.certified.group.repo.createRecord", { body })
    expect(sentBody().record).toEqual({ title: "t" })
  })

  it("still sends the request when the signer throws", async () => {
    vi.doMock("@/lib/atproto/created-via", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/atproto/created-via")>()
      return {
        ...actual,
        signCreatedVia: (
          record: Parameters<typeof actual.signCreatedVia>[0],
          opts: Parameters<typeof actual.signCreatedVia>[1],
        ) =>
          actual.signCreatedVia(record, opts, {
            status: "ready",
            did: "did:web:certified.app",
            keyId: "did:web:certified.app#created-via",
            publicKeyMultibase: "z",
            sign: async () => {
              throw new Error("boom")
            },
          }),
      }
    })
    const { groupServiceFetch } = await import("../proxy-agent")
    await groupServiceFetch(agent, "app.certified.group.repo.createRecord", {
      body: { repo: GROUP_DID, collection: "org.hypercerts.claim.activity", record: { title: "t" } },
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(sentBody().record.signatures).toBeUndefined()
  })
})
