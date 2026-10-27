// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Secp256k1Keypair, verifySignature } from "@atproto/crypto"
import { cidForLex } from "@atproto/lex-cbor"
import { jsonToLex, type JsonValue } from "@atproto/lex-json"
import { fromBase64 } from "@atproto/lex-data"

/**
 * `#createdVia` signing at the own-repo write point, and the same-session
 * read conversion that keeps `$bytes` intact across an edit round trip.
 *
 * Real signing (node env — jsdom's Uint8Array realm breaks the encoders) with
 * a test key; the agent and auth layers are mocked. `lexToJson` is the real
 * one from `@atproto/api`, since that conversion is what's under test.
 */

const KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const OWN_DID = "did:plc:s4puetfspot742ai7y4otuel"
const CREATED_VIA = "app.certified.signature.defs#createdVia"
const BLOB = {
  $type: "blob",
  ref: { $link: "bafkreiffatp7ehgfe6e4diqocq6uwzpkqwtydm5qf5nm6mi3zon4cyglt4" },
  mimeType: "image/png",
  size: 1234,
}

const getSessionDid = vi.fn()
const getOAuthClient = vi.fn()
const createRecord = vi.fn()
const putRecord = vi.fn()
const getRecord = vi.fn()
const listRecords = vi.fn()

vi.mock("@/lib/auth/oauth-client", () => ({ getOAuthClient }))
vi.mock("@/lib/auth/session", () => ({ getSessionDid, deleteSession: vi.fn() }))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn() }))
vi.mock("@/lib/atproto/did", () => ({ resolvePdsUrl: vi.fn(), invalidateDidDoc: vi.fn() }))
vi.mock("@/lib/auth/rate-limit", () => ({
  checkAndIncrementWriteRate: vi.fn(),
  RATE_LIMITED_WRITE_COLLECTIONS: {},
  makeLimiter: (name: string, max: number, windowSec: number) => ({ name, max, windowSec }),
  enforceRateLimit: vi.fn(async () => null),
}))
vi.mock("@/lib/utils/ip", () => ({ clientIp: () => "test-ip" }))
vi.mock("@atproto/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@atproto/api")>()
  return {
    lexToJson: actual.lexToJson,
    jsonToLex: actual.jsonToLex,
    BlobRef: actual.BlobRef,
    Agent: class {
      com = { atproto: { repo: { createRecord, putRecord, getRecord, listRecords } } }
    },
  }
})

type Route = typeof import("../route")

function post(methodName: string, body: unknown) {
  return {
    nextUrl: new URL(`https://app.example/api/xrpc/${methodName}`),
    json: async () => body,
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Parameters<Route["POST"]>[0]
}

function get(query: string) {
  return { nextUrl: new URL(`https://app.example/api/xrpc/${query}`) } as unknown as Parameters<
    Route["GET"]
  >[0]
}

function params(methodName: string) {
  return { params: Promise.resolve({ method: methodName.split(".") }) }
}

type Entry = { $type: string; key?: string; signature?: { $bytes: string } }
const createdViaEntries = (record: { signatures?: Entry[] }) =>
  (record.signatures ?? []).filter((e) => e.$type === CREATED_VIA)

/** Verifier side: the record as the PDS would store it (its JSON), `$sig` rebuilt from the entry. */
async function verifiesFor(sent: Record<string, unknown>, repository: string) {
  const stored = JSON.parse(JSON.stringify(sent)) as Record<string, unknown> & { signatures?: Entry[] }
  const entries = createdViaEntries(stored)
  if (entries.length !== 1) return false
  const { signature, ...sigMeta } = entries[0]
  const { signatures: _s, ...rest } = stored
  const cid = await cidForLex(jsonToLex({ ...rest, $sig: { ...sigMeta, repository } } as JsonValue, { strict: true }))
  const didKey = (await Secp256k1Keypair.import(KEY_HEX)).did()
  return verifySignature(didKey, cid.bytes, fromBase64(signature!.$bytes))
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("CREATED_VIA_SIGNING_KEY", KEY_HEX)
  vi.stubEnv("CREATED_VIA_DID", "did:web:certified.app")
  vi.stubEnv("PUBLIC_URL", "https://certified.app")
  getSessionDid.mockReset().mockResolvedValue(OWN_DID)
  getOAuthClient.mockReset().mockResolvedValue({ restore: vi.fn().mockResolvedValue({}) })
  createRecord.mockReset().mockResolvedValue({ data: { uri: "at://u", cid: "b" } })
  putRecord.mockReset().mockResolvedValue({ data: { uri: "at://u", cid: "b" } })
  getRecord.mockReset()
  listRecords.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("own-repo writes carry a createdVia signature", () => {
  it.each(["com.atproto.repo.createRecord", "com.atproto.repo.putRecord"])("%s", async (method) => {
    const { POST } = await import("../route")
    const res = await POST(
      post(method, {
        repo: OWN_DID,
        collection: "org.hypercerts.claim.activity",
        rkey: "3abc",
        record: { title: "t", createdAt: "2026-10-27T00:00:00.000Z" },
      }),
      params(method),
    )
    expect(res.status).toBe(200)
    const sent = (method.endsWith("createRecord") ? createRecord : putRecord).mock.calls[0][0]
    expect(sent.record.$type).toBe("org.hypercerts.claim.activity")
    const [entry] = createdViaEntries(sent.record)
    expect(entry.key).toBe("did:web:certified.app#created-via")
    expect(await verifiesFor(sent.record, OWN_DID)).toBe(true)
    expect(await verifiesFor(sent.record, "did:plc:someoneelse0000000000000")).toBe(false)
  })

  it("leaves app.bsky.graph.follow unsigned", async () => {
    const { POST } = await import("../route")
    const record = { $type: "app.bsky.graph.follow", subject: "did:plc:x", createdAt: "2026-10-27T00:00:00.000Z" }
    await POST(
      post("com.atproto.repo.createRecord", { repo: OWN_DID, collection: "app.bsky.graph.follow", record }),
      params("com.atproto.repo.createRecord"),
    )
    expect(createRecord.mock.calls[0][0].record).toEqual(record)
  })
})

describe("same-session reads return the JSON wire form", () => {
  it("getRecord returns $bytes and $link, not lex values", async () => {
    // What the agent hands back: lex-decoded values (multiformats 9 CID via
    // the agent's own jsonToLex), exactly as @atproto/xrpc parses responses.
    const { jsonToLex: agentJsonToLex } = await import("@atproto/api")
    const value = {
      $type: "org.hypercerts.claim.activity",
      title: "t",
      image: BLOB,
      signatures: [{ $type: "app.certified.signature.defs#inline", key: "did:web:x#k", signature: { $bytes: "AQID" } }],
    }
    getRecord.mockResolvedValue({ data: agentJsonToLex({ uri: "at://u", cid: "bafy", value }) })

    const { GET } = await import("../route")
    const res = await GET(
      get(`com.atproto.repo.getRecord?repo=${OWN_DID}&collection=org.hypercerts.claim.activity&rkey=3abc`),
      params("com.atproto.repo.getRecord"),
    )
    const body = await res.json()
    expect(body.value.signatures[0].signature).toEqual({ $bytes: "AQID" })
    expect(body.value.image.ref).toEqual({ $link: BLOB.ref.$link })
  })

  it("keeps the typed blob shape for a legacy {cid, mimeType} blob", async () => {
    const { jsonToLex: agentJsonToLex } = await import("@atproto/api")
    const value = {
      $type: "org.hypercerts.claim.activity",
      image: { cid: BLOB.ref.$link, mimeType: "image/png" },
    }
    getRecord.mockResolvedValue({ data: agentJsonToLex({ uri: "at://u", cid: "bafy", value }) })
    const { GET } = await import("../route")
    const res = await GET(
      get(`com.atproto.repo.getRecord?repo=${OWN_DID}&collection=org.hypercerts.claim.activity&rkey=3abc`),
      params("com.atproto.repo.getRecord"),
    )
    // Same as BlobRef.toJSON (the previous serialization): client code reads ref.$link.
    expect((await res.json()).value.image).toEqual({
      $type: "blob",
      ref: { $link: BLOB.ref.$link },
      mimeType: "image/png",
      size: -1,
    })
  })

  it("listRecords without $bytes comes back unchanged", async () => {
    const data = { records: [{ uri: "at://a/b/c", cid: "bafy", value: { $type: "org.hypercerts.collection", type: "list:certs" } }] }
    listRecords.mockResolvedValue({ data })
    const { GET } = await import("../route")
    const res = await GET(
      get(`com.atproto.repo.listRecords?repo=${OWN_DID}&collection=org.hypercerts.collection`),
      params("com.atproto.repo.listRecords"),
    )
    expect(await res.json()).toEqual(data)
  })

  it("an edit round trip (read, spread, put) re-signs a record whose CID matches what was sent", async () => {
    const { jsonToLex: agentJsonToLex } = await import("@atproto/api")
    const stored = {
      $type: "org.hypercerts.claim.activity",
      title: "before",
      image: BLOB,
      signatures: [
        { $type: CREATED_VIA, key: "did:web:certified.app#created-via", signature: { $bytes: "AAAA" } },
      ],
    }
    getRecord.mockResolvedValue({ data: agentJsonToLex({ uri: "at://u", cid: "bafy", value: stored }) })

    const { GET, POST } = await import("../route")
    const read = await (
      await GET(
        get(`com.atproto.repo.getRecord?repo=${OWN_DID}&collection=org.hypercerts.claim.activity&rkey=3abc`),
        params("com.atproto.repo.getRecord"),
      )
    ).json()

    await POST(
      post("com.atproto.repo.putRecord", {
        repo: OWN_DID,
        collection: "org.hypercerts.claim.activity",
        rkey: "3abc",
        record: { ...read.value, title: "after" },
      }),
      params("com.atproto.repo.putRecord"),
    )
    const sent = putRecord.mock.calls[0][0].record
    expect(sent.image).toEqual(BLOB)
    expect(sent.title).toBe("after")
    // The stale createdVia is replaced by one that verifies over the
    // edited JSON exactly as the PDS will store it.
    expect(await verifiesFor(sent, OWN_DID)).toBe(true)
  })
})
