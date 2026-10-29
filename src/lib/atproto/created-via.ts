import "server-only"
import type { JsonValue } from "@atproto/lex-json"
import { isLoopbackHost } from "@/lib/utils/config"
import { logSafe } from "@/lib/utils/log-safe"

/**
 * `app.certified.signature.defs#createdVia` — an inline signature by the
 * application that wrote this version of a record (hypercerts-lexicon 1.6.0).
 *
 * It attests only that an authenticated user wrote the record through
 * certified.app's server. It does NOT mean certified.app validated or
 * endorses the content — any UI that surfaces it must say so.
 *
 * Signing procedure (lexicon README + ATProtocol Attestation Spec):
 *   1. Normalize via a JSON round trip and set `$type` = collection, so the
 *      signed bytes are exactly the bytes sent.
 *   2. Drop `signatures`, insert `$sig` = { $type, key, repository }.
 *   3. CIDv1 (dag-cbor, sha-256) of that value; ECDSA secp256k1 (low-S) over
 *      the 36 CID bytes.
 *   4. Store the record with `signatures` = [...kept entries, entry +
 *      `signature: { $bytes }`]. `$sig` is never stored.
 *
 * Encoding uses `@atproto/lex-json` + `@atproto/lex-cbor`. Never use
 * `@atproto/lexicon`'s `jsonToLex` here: it turns blobs into `BlobRef`
 * instances, which encode to a different CID than the PDS stores.
 *
 * Signing is best-effort and never blocks a write: `signCreatedVia` never
 * throws, and on any failure the record goes out without a createdVia entry.
 * See AGENTS.md "Record signing (createdVia)".
 */

export const CREATED_VIA_TYPE = "app.certified.signature.defs#createdVia"
const CREATED_VIA_KEY_FRAGMENT = "created-via"

/**
 * Collections whose lexicons carry `signatures` (`app.certified.signature.defs#list`).
 * Every collection the app writes must be in exactly one of these two sets —
 * `__tests__/created-via.test.ts` enforces it against the xrpc allowlist and
 * the group routes.
 */
export const SIGNED_COLLECTIONS: ReadonlySet<string> = new Set([
  "app.certified.actor.profile",
  "app.certified.actor.organization",
  "app.certified.location",
  "app.certified.badge.definition",
  "app.certified.badge.award",
  "app.certified.badge.response",
  "app.certified.graph.follow",
  "org.hypercerts.claim.activity",
  "org.hypercerts.claim.contributorInformation",
  "org.hypercerts.collection",
  "org.hypercerts.context.attachment",
  "org.hypercerts.funding.receipt",
  "org.hyperboards.board",
  "org.hyperboards.displayProfile",
])

/** Not hypercerts lexicons — left untouched (a scope choice). */
export const UNSIGNED_COLLECTIONS: ReadonlySet<string> = new Set([
  "app.bsky.actor.profile",
  "app.bsky.graph.follow",
  "org.impactindexer.link.attestation",
])

export function shouldSign(collection: unknown): collection is string {
  return typeof collection === "string" && SIGNED_COLLECTIONS.has(collection)
}

export type CreatedViaSigner =
  | {
      status: "ready"
      did: string
      /** Full verification method reference: `<did>#created-via`. */
      keyId: string
      publicKeyMultibase: string
      sign: (bytes: Uint8Array) => Promise<Uint8Array>
    }
  | { status: "disabled"; reason: string }
  | { status: "invalid" }

export interface CreatedViaEnv {
  CREATED_VIA_SIGNING_KEY?: string
  CREATED_VIA_DID?: string
  PUBLIC_URL?: string
}

/** Fixed string — the key-import error could echo key material. */
export const INVALID_KEY_MESSAGE = "[created-via] invalid signing key"

/**
 * Builds the signer from env. Signing is enabled only when the key, an
 * explicit `CREATED_VIA_DID` and an explicit `PUBLIC_URL` are all set, and the
 * DID equals `did:web:<PUBLIC_URL host>`. `VERCEL_*` hosts are never used:
 * preview deploys and local dev would otherwise sign real records under DIDs
 * nobody can resolve. `CREATED_VIA_DID` is deliberately redundant with
 * `PUBLIC_URL` so a drifted `PUBLIC_URL` stops signing instead of silently
 * switching DIDs.
 */
export async function loadCreatedViaSigner(
  env: CreatedViaEnv,
): Promise<CreatedViaSigner> {
  const key = env.CREATED_VIA_SIGNING_KEY?.trim()
  const configuredDid = env.CREATED_VIA_DID?.trim()
  const publicUrl = env.PUBLIC_URL?.trim()
  if (!key) return { status: "disabled", reason: "CREATED_VIA_SIGNING_KEY not set" }
  if (!configuredDid) return { status: "disabled", reason: "CREATED_VIA_DID not set" }
  if (!publicUrl) return { status: "disabled", reason: "PUBLIC_URL not set" }

  let url: URL
  try {
    url = new URL(publicUrl)
  } catch {
    return { status: "disabled", reason: "PUBLIC_URL is not a URL" }
  }
  if (url.protocol !== "https:" || isLoopbackHost(url.hostname)) {
    return { status: "disabled", reason: "PUBLIC_URL is not a public https host" }
  }
  if (url.hostname.endsWith(".vercel.app")) {
    return { status: "disabled", reason: "PUBLIC_URL is a *.vercel.app host" }
  }
  const did = `did:web:${url.host.replace(":", "%3A")}`
  if (configuredDid !== did) {
    return { status: "disabled", reason: "CREATED_VIA_DID does not match PUBLIC_URL" }
  }

  const hex = key.replace(/^0x/i, "")
  if (!/^[0-9a-f]{64}$/i.test(hex)) return { status: "invalid" }
  try {
    const { Secp256k1Keypair } = await import("@atproto/crypto")
    const keypair = await Secp256k1Keypair.import(hex)
    return {
      status: "ready",
      did,
      keyId: `${did}#${CREATED_VIA_KEY_FRAGMENT}`,
      publicKeyMultibase: keypair.did().slice("did:key:".length),
      sign: (bytes) => keypair.sign(bytes),
    }
  } catch {
    // Never log the error: it could echo key material. Callers log
    // INVALID_KEY_MESSAGE on every attempt so the logs stay searchable.
    return { status: "invalid" }
  }
}

let signerPromise: Promise<CreatedViaSigner> | undefined

/** Process-wide signer, loaded once per instance from `process.env`. */
export function getCreatedViaSigner(): Promise<CreatedViaSigner> {
  if (!signerPromise) {
    signerPromise = loadCreatedViaSigner({
      CREATED_VIA_SIGNING_KEY: process.env.CREATED_VIA_SIGNING_KEY,
      CREATED_VIA_DID: process.env.CREATED_VIA_DID,
      PUBLIC_URL: process.env.PUBLIC_URL,
    }).then((signer) => {
      if (signer.status === "disabled") {
        console.warn(`[created-via] record signing disabled: ${signer.reason}`)
      }
      return signer
    })
  }
  return signerPromise
}

/** The `/.well-known/did.json` document for a ready signer. */
export function getCreatedViaDidDocument(
  signer: Extract<CreatedViaSigner, { status: "ready" }>,
) {
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/multikey/v1",
    ],
    id: signer.did,
    verificationMethod: [
      {
        id: signer.keyId,
        type: "Multikey",
        controller: signer.did,
        publicKeyMultibase: signer.publicKeyMultibase,
      },
    ],
  }
}

type JsonRecord = Record<string, unknown>

function isPlainObject(value: unknown): value is JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Entries kept on re-sign: everything except createdVia (always replaced) and
 * malformed entries (no `$type`, or a `signature` that isn't `{ $bytes }`).
 * Third-party signatures over older content stay even though they no longer
 * verify — consumers ignore invalid signatures, per the spec.
 */
function keptSignatures(value: unknown, collection: string): unknown[] {
  if (!Array.isArray(value)) return []
  let malformed = 0
  const kept = value.filter((entry) => {
    if (!isPlainObject(entry) || typeof entry.$type !== "string") {
      malformed++
      return false
    }
    if (entry.$type === CREATED_VIA_TYPE) return false
    if ("signature" in entry) {
      const sig = entry.signature
      if (!isPlainObject(sig) || typeof sig.$bytes !== "string") {
        malformed++
        return false
      }
    }
    return true
  })
  if (malformed > 0) {
    console.warn("[created-via] dropped malformed signatures", { collection, malformed })
  }
  return kept
}

/**
 * Returns `record` with a fresh `#createdVia` signature for `repo` (the DID of
 * the repository that will hold it). Untouched: records in collections outside
 * {@link SIGNED_COLLECTIONS}, and records whose `$type` names a different
 * collection (the PDS rejects those, as before). Never throws: on any failure,
 * or when signing is disabled, the record is returned normalized, without a
 * createdVia entry. A client-sent `$sig` is never stored.
 *
 * The result is the JSON wire form (Dates become strings), hence the plain
 * record type rather than the caller's.
 */
export async function signCreatedVia(
  record: JsonRecord,
  opts: { collection: unknown; repo: unknown },
  signer: Promise<CreatedViaSigner> | CreatedViaSigner = getCreatedViaSigner(),
): Promise<JsonRecord> {
  const { collection, repo } = opts
  if (!isPlainObject(record) || !shouldSign(collection)) return record
  if (record.$type !== undefined && record.$type !== collection) return record

  let fallback: JsonRecord = record
  try {
    const normalized = JSON.parse(JSON.stringify(record)) as JsonRecord
    const kept = keptSignatures(normalized.signatures, collection)
    delete normalized.signatures
    delete normalized.$sig
    const base: JsonRecord = { ...normalized, $type: collection }
    fallback = kept.length > 0 ? { ...base, signatures: kept } : base

    if (typeof repo !== "string" || !repo.startsWith("did:")) {
      console.warn("[created-via] not signing: repo is not a DID", { collection })
      return fallback
    }

    const ready = await signer
    if (ready.status === "invalid") console.error(INVALID_KEY_MESSAGE)
    if (ready.status !== "ready") return fallback

    const entry = { $type: CREATED_VIA_TYPE, key: ready.keyId }
    const [{ jsonToLex }, { cidForLex }, { toBase64 }] = await Promise.all([
      import("@atproto/lex-json"),
      import("@atproto/lex-cbor"),
      import("@atproto/lex-data"),
    ])
    const unsigned = { ...base, $sig: { ...entry, repository: repo } } as JsonValue
    const cid = await cidForLex(jsonToLex(unsigned, { strict: true }))
    const signature = await ready.sign(cid.bytes)
    return {
      ...base,
      signatures: [...kept, { ...entry, signature: { $bytes: toBase64(signature) } }],
    }
  } catch (err) {
    logSafe("[created-via] sign failed", err, { collection, repo })
    return fallback
  }
}
