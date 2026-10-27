// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { Secp256k1Keypair, verifySignature } from "@atproto/crypto"
import { cidForLex } from "@atproto/lex-cbor"
import { jsonToLex, type JsonValue } from "@atproto/lex-json"
import { fromBase64 } from "@atproto/lex-data"
import {
  CREATED_VIA_TYPE,
  INVALID_KEY_MESSAGE,
  SIGNED_COLLECTIONS,
  UNSIGNED_COLLECTIONS,
  getCreatedViaDidDocument,
  loadCreatedViaSigner,
  signCreatedVia,
  type CreatedViaSigner,
} from "../created-via"
import pdsFixture from "./fixtures/pds-record-with-blob.json"

/**
 * `#createdVia` record signing.
 *
 * Known-answer provenance: hypercerts-lexicon 1.6.0 ships no crypto vectors,
 * so KAT_SIG_CID and KAT_SIGNATURE were computed once, independently of this
 * module, with this scratch script (deps: @ipld/dag-cbor@9.2.4,
 * multiformats@13.4.2, @noble/curves@1.9.7, @noble/hashes@1.8.0). A wrong
 * encoding here can't pin itself as correct.
 *
 *   import * as dagCbor from "@ipld/dag-cbor"
 *   import { CID } from "multiformats/cid"
 *   import { sha256 } from "multiformats/hashes/sha2"
 *   import * as raw from "multiformats/codecs/raw"
 *   import { secp256k1 } from "@noble/curves/secp256k1"
 *   import { sha256 as nobleSha } from "@noble/hashes/sha256"
 *   const blob = CID.create(1, raw.code, await sha256.digest(
 *     new TextEncoder().encode("certified-app createdVia fixture blob")))
 *   const value = { $type: "org.hypercerts.claim.activity",
 *     title: "Known-answer fixture", createdAt: "2026-10-27T00:00:00.000Z",
 *     image: { $type: "blob", ref: blob, mimeType: "image/png", size: 1234 },
 *     extra: new Uint8Array([1, 2, 3]),
 *     $sig: { $type: "app.certified.signature.defs#createdVia",
 *       key: "did:web:certified.app#created-via",
 *       repository: "did:plc:abcdefghijklmnopqrstuvwx" } }
 *   const cid = CID.create(1, dagCbor.code, await sha256.digest(dagCbor.encode(value)))
 *   const sig = secp256k1.sign(nobleSha(cid.bytes), Buffer.from(KEY_HEX, "hex"),
 *     { lowS: true }).toCompactRawBytes()
 *   console.log(cid.toString(), Buffer.from(sig).toString("base64"))
 *
 * The PDS fixture (fixtures/pds-record-with-blob.json) is the public
 * `app.bsky.actor.profile/self` record of did:plc:z72i7hdynmk6r22z27h6tvur
 * (@bsky.app), fetched from its PDS: a real stored record with two blobs.
 */

const KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const DID = "did:web:certified.app"
const REPO = "did:plc:abcdefghijklmnopqrstuvwx"
const COLLECTION = "org.hypercerts.claim.activity"
const ENV = { CREATED_VIA_SIGNING_KEY: KEY_HEX, CREATED_VIA_DID: DID, PUBLIC_URL: "https://certified.app" }

const KAT_RECORD = {
  $type: COLLECTION,
  title: "Known-answer fixture",
  createdAt: "2026-10-27T00:00:00.000Z",
  image: {
    $type: "blob",
    ref: { $link: "bafkreiffatp7ehgfe6e4diqocq6uwzpkqwtydm5qf5nm6mi3zon4cyglt4" },
    mimeType: "image/png",
    size: 1234,
  },
  extra: { $bytes: "AQID" },
}
const KAT_SIG_CID = "bafyreicjkekfpycexfpuhlba22bfgcduthf6snr7ymgqjek7oeshndbkou"
// Standard base64 alphabet. lex-data's toBase64 emits it unpadded; padding is
// optional in the data model. The independent computation gave the same bytes
// with "==" appended.
const KAT_SIGNATURE =
  "kejx6Ihm4H9IoTBvzQYbrQAKEwF6AT+Svt6+8y/IK9x56PZSIq8nSaPWuRWh1FURnpLuY8OQp88Xhf9xDtctpw"

type Json = Record<string, unknown>
type Entry = { $type: string; key?: string; signature?: { $bytes: string } }

async function readySigner(): Promise<Extract<CreatedViaSigner, { status: "ready" }>> {
  const signer = await loadCreatedViaSigner(ENV)
  if (signer.status !== "ready") throw new Error(`signer not ready: ${signer.status}`)
  return signer
}

function createdVia(record: Json): Entry[] {
  return ((record.signatures ?? []) as Entry[]).filter((e) => e.$type === CREATED_VIA_TYPE)
}

/** Verifier side, per the lexicon README: rebuild `$sig` from the stored JSON. */
async function verifyStored(stored: Json, repository: string, didKey: string) {
  const parsed = JSON.parse(JSON.stringify(stored)) as Json
  const [entry] = createdVia(parsed)
  const { signatures: _s, ...rest } = parsed
  const unsigned = { ...rest, $sig: { $type: entry.$type, key: entry.key, repository } }
  const cid = await cidForLex(jsonToLex(unsigned as JsonValue, { strict: true }))
  return verifySignature(didKey, cid.bytes, fromBase64(entry.signature!.$bytes))
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("signCreatedVia — known answer", () => {
  it("matches the independently computed $sig CID and signature", async () => {
    const signer = await readySigner()
    const sign = vi.fn(signer.sign)
    const signed = (await signCreatedVia(KAT_RECORD, { collection: COLLECTION, repo: REPO }, {
      ...signer,
      sign,
    })) as Json

    const signedBytes = sign.mock.calls[0][0]
    const expectedCid = await cidForLex(
      jsonToLex(
        {
          ...KAT_RECORD,
          $sig: { $type: CREATED_VIA_TYPE, key: `${DID}#created-via`, repository: REPO },
        } as JsonValue,
        { strict: true },
      ),
    )
    expect(expectedCid.toString()).toBe(KAT_SIG_CID)
    expect(Array.from(signedBytes)).toEqual(Array.from(expectedCid.bytes))
    expect(signed.signatures).toEqual([
      { $type: CREATED_VIA_TYPE, key: `${DID}#created-via`, signature: { $bytes: KAT_SIGNATURE } },
    ])
    expect(signed).not.toHaveProperty("$sig")
  })

  it("verifies after a JSON round trip, and fails when tampered or re-homed", async () => {
    const signer = await readySigner()
    const didKey = (await Secp256k1Keypair.import(KEY_HEX)).did()
    const signed = (await signCreatedVia(KAT_RECORD, { collection: COLLECTION, repo: REPO }, signer)) as Json

    expect(await verifyStored(signed, REPO, didKey)).toBe(true)
    expect(await verifyStored({ ...signed, title: "tampered" }, REPO, didKey)).toBe(false)
    expect(await verifyStored(signed, "did:plc:someoneelse0000000000000", didKey)).toBe(false)
  })
})

describe("signCreatedVia — existing signatures", () => {
  const inline = { $type: "app.certified.signature.defs#inline", key: "did:web:x#k", signature: { $bytes: "AQID" } }
  const strongRef = { $type: "com.atproto.repo.strongRef", uri: "at://did:plc:x/c/r", cid: "bafy" }

  it("replaces a stale createdVia, keeps well-formed entries, drops malformed ones", async () => {
    const signer = await readySigner()
    const record = {
      ...KAT_RECORD,
      signatures: [
        { $type: CREATED_VIA_TYPE, key: "did:web:old#created-via", signature: { $bytes: "AAAA" } },
        inline,
        strongRef,
        { $type: "app.certified.signature.defs#inline", key: "k", signature: { "0": 1, "1": 2 } },
        "not-an-object",
      ],
    }
    const signed = (await signCreatedVia(record, { collection: COLLECTION, repo: REPO }, signer)) as Json
    const entries = signed.signatures as Entry[]

    expect(entries.slice(0, 2)).toEqual([inline, strongRef])
    expect(createdVia(signed)).toHaveLength(1)
    expect(createdVia(signed)[0].key).toBe(`${DID}#created-via`)
    expect(entries).toHaveLength(3)
  })

  it("never stores a client-supplied $sig", async () => {
    const signer = await readySigner()
    const didKey = (await Secp256k1Keypair.import(KEY_HEX)).did()
    const record = { ...KAT_RECORD, $sig: { $type: CREATED_VIA_TYPE, key: "forged", repository: "did:plc:evil" } }
    const signed = (await signCreatedVia(record, { collection: COLLECTION, repo: REPO }, signer)) as Json
    expect(signed).not.toHaveProperty("$sig")
    expect(await verifyStored(signed, REPO, didKey)).toBe(true)
  })

  it("leaves a record whose $type names another collection untouched (the PDS rejects it)", async () => {
    const record = { ...KAT_RECORD, $type: "org.hypercerts.collection" }
    expect(await signCreatedVia(record, { collection: COLLECTION, repo: REPO }, await readySigner())).toBe(record)
  })

  it("strips a client-supplied createdVia when signing is disabled", async () => {
    const record = { ...KAT_RECORD, signatures: [{ $type: CREATED_VIA_TYPE, key: "forged", signature: { $bytes: "AA" } }] }
    const out = (await signCreatedVia(record, { collection: COLLECTION, repo: REPO }, {
      status: "disabled",
      reason: "test",
    })) as Json
    expect(out).not.toHaveProperty("signatures")
    expect(out.title).toBe(KAT_RECORD.title)
  })
})

describe("signCreatedVia — never throws", () => {
  it("passes a record with a float through unsigned", async () => {
    const signer = await readySigner()
    const out = (await signCreatedVia({ ...KAT_RECORD, weight: 1.5 }, { collection: COLLECTION, repo: REPO }, signer)) as Json
    expect(out).not.toHaveProperty("signatures")
    expect(out.weight).toBe(1.5)
  })

  it("drops nested undefined (as JSON.stringify would) and still signs", async () => {
    const signer = await readySigner()
    const out = (await signCreatedVia(
      { ...KAT_RECORD, nested: { a: undefined, b: 1 } },
      { collection: COLLECTION, repo: REPO },
      signer,
    )) as Json
    expect(out.nested).toEqual({ b: 1 })
    expect(createdVia(out)).toHaveLength(1)
  })

  it("survives a signer that throws", async () => {
    const signer = await readySigner()
    const out = (await signCreatedVia(KAT_RECORD, { collection: COLLECTION, repo: REPO }, {
      ...signer,
      sign: async () => {
        throw new Error("boom")
      },
    })) as Json
    expect(out).not.toHaveProperty("signatures")
  })
})

describe("signCreatedVia — skipped per call", () => {
  it("does not sign for a handle as repo", async () => {
    const out = (await signCreatedVia(KAT_RECORD, { collection: COLLECTION, repo: "alice.certified.one" }, await readySigner())) as Json
    expect(out).not.toHaveProperty("signatures")
  })

  it("leaves an unsigned collection untouched", async () => {
    const record = { $type: "app.bsky.actor.profile", createdAt: "2026-10-27T00:00:00.000Z" }
    const out = await signCreatedVia(record, { collection: "app.bsky.actor.profile", repo: REPO }, await readySigner())
    expect(out).toBe(record)
  })

  it("leaves a record with a non-string collection untouched", async () => {
    const out = await signCreatedVia(KAT_RECORD, { collection: undefined, repo: REPO }, await readySigner())
    expect(out).toBe(KAT_RECORD)
  })
})

describe("loadCreatedViaSigner", () => {
  it.each([
    ["no key", { ...ENV, CREATED_VIA_SIGNING_KEY: undefined }],
    ["no DID", { ...ENV, CREATED_VIA_DID: undefined }],
    ["PUBLIC_URL unset (VERCEL_URL is never used)", { ...ENV, PUBLIC_URL: undefined, VERCEL_URL: "x.vercel.app" }],
    ["loopback", { ...ENV, PUBLIC_URL: "http://localhost:3000", CREATED_VIA_DID: "did:web:localhost%3A3000" }],
    ["*.vercel.app", { ...ENV, PUBLIC_URL: "https://certified-app-git-x.vercel.app", CREATED_VIA_DID: "did:web:certified-app-git-x.vercel.app" }],
    ["DID mismatch", { ...ENV, CREATED_VIA_DID: "did:web:staging.certified.app" }],
  ])("is disabled with %s", async (_label, env) => {
    expect((await loadCreatedViaSigner(env)).status).toBe("disabled")
  })

  it("derives a per-host DID", async () => {
    const signer = await loadCreatedViaSigner({
      ...ENV,
      PUBLIC_URL: "https://staging.certified.app",
      CREATED_VIA_DID: "did:web:staging.certified.app",
    })
    expect(signer.status).toBe("ready")
  })

  it.each(["nothex", "ff".repeat(32), "00".repeat(32)])(
    "reports an invalid key on every attempt without logging key material (%s)",
    async (key) => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
      const warns = vi.spyOn(console, "warn").mockImplementation(() => undefined)
      const signer = await loadCreatedViaSigner({ ...ENV, CREATED_VIA_SIGNING_KEY: key })
      expect(signer.status).toBe("invalid")
      const out = (await signCreatedVia(KAT_RECORD, { collection: COLLECTION, repo: REPO }, signer)) as Json
      await signCreatedVia(KAT_RECORD, { collection: COLLECTION, repo: REPO }, signer)
      expect(out).not.toHaveProperty("signatures")
      expect(errors.mock.calls.filter((c) => c[0] === INVALID_KEY_MESSAGE)).toHaveLength(2)
      const logged = JSON.stringify([...errors.mock.calls, ...warns.mock.calls])
      expect(logged).not.toContain(key)
    },
  )
})

describe("getCreatedViaSigner", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("loads once per instance and warns once when disabled", async () => {
    vi.resetModules()
    vi.stubEnv("CREATED_VIA_SIGNING_KEY", "")
    const warns = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const mod = await import("../created-via")
    const first = mod.getCreatedViaSigner()
    expect(mod.getCreatedViaSigner()).toBe(first)
    expect((await first).status).toBe("disabled")
    await mod.getCreatedViaSigner()
    expect(warns.mock.calls.filter((c) => String(c[0]).includes("record signing disabled"))).toHaveLength(1)
  })

  it("picks up a changed env on a fresh instance", async () => {
    vi.resetModules()
    vi.stubEnv("CREATED_VIA_SIGNING_KEY", KEY_HEX)
    vi.stubEnv("CREATED_VIA_DID", DID)
    vi.stubEnv("PUBLIC_URL", "https://certified.app")
    const mod = await import("../created-via")
    expect((await mod.getCreatedViaSigner()).status).toBe("ready")
  })
})

describe("getCreatedViaDidDocument", () => {
  it("publishes the secp256k1 Multikey under the full key reference", async () => {
    const doc = getCreatedViaDidDocument(await readySigner())
    expect(doc["@context"]).toEqual([
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/multikey/v1",
    ])
    expect(doc.id).toBe(DID)
    expect(doc.verificationMethod).toHaveLength(1)
    const [method] = doc.verificationMethod
    expect(method).toMatchObject({ id: `${DID}#created-via`, type: "Multikey", controller: DID })
    expect(method.publicKeyMultibase.startsWith("zQ3s")).toBe(true)
    expect(`did:key:${method.publicKeyMultibase}`).toBe((await Secp256k1Keypair.import(KEY_HEX)).did())
  })
})

describe("encoding matches the PDS", () => {
  it("recomputes the CID of a real stored record with a blob", async () => {
    const cid = await cidForLex(jsonToLex(pdsFixture.value as JsonValue, { strict: true }))
    expect(cid.toString()).toBe(pdsFixture.cid)
  })
})

describe("collection coverage", () => {
  const root = path.resolve(__dirname, "../../../..")

  function read(rel: string) {
    return readFileSync(path.join(root, rel), "utf8")
  }

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (name === "__tests__") return []
      return statSync(full).isDirectory() ? walk(full) : full.endsWith("route.ts") ? [full] : []
    })
  }

  function expectPartitioned(collections: string[]) {
    expect(collections.length).toBeGreaterThan(0)
    for (const c of collections) {
      const inSigned = SIGNED_COLLECTIONS.has(c)
      const inUnsigned = UNSIGNED_COLLECTIONS.has(c)
      expect(inSigned !== inUnsigned, `${c} must be in exactly one of SIGNED/UNSIGNED_COLLECTIONS`).toBe(true)
    }
  }

  it("covers every ALLOWED_WRITE_COLLECTIONS entry in the xrpc proxy", () => {
    const src = read("src/app/api/xrpc/[...method]/route.ts")
    const block = src.slice(src.indexOf("const ALLOWED_WRITE_COLLECTIONS = ["), src.indexOf("]", src.indexOf("const ALLOWED_WRITE_COLLECTIONS = [")))
    const collections = [...block.replace(/\/\/.*$/gm, "").matchAll(/"([a-z0-9.]+)"/gi)].map((m) => m[1])
    expectPartitioned(collections)
  })

  it("covers every collection the group routes write", () => {
    const files = walk(path.join(root, "src/app/api/groups"))
    const collections = files.flatMap((f) => {
      const src = readFileSync(f, "utf8")
      return [...src.matchAll(/(?:_COLLECTION\s*=\s*|collection:\s*)"([a-z0-9.]+)"/gi)].map((m) => m[1])
    })
    expectPartitioned([...new Set(collections)])
  })
})
