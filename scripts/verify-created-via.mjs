#!/usr/bin/env node
/**
 * Verify the #createdVia signature on a stored record (AGENTS.md §16a).
 *
 *   node scripts/verify-created-via.mjs at://did:plc:…/org.hypercerts.claim.activity/3abc
 *
 * Read-only. Verifies the way a third party would (hypercerts-lexicon README,
 * ATProtocol Attestation Spec): resolve the repo's PDS, fetch the record,
 * resolve each createdVia key's did:web document (verificationMethod, then
 * assertionMethod), rebuild `$sig` from the entry as stored (minus its
 * `signature`) plus `repository`, and check the signature. Also checks the
 * PDS's CID equals the locally computed CID of the stored record, proving our
 * encoding matches the PDS. Exits non-zero unless exactly one createdVia
 * entry verifies. Supports did:plc and host-only did:web (atproto's subset).
 * Not part of CI.
 */
import { verifySignature } from "@atproto/crypto"
import { cidForLex } from "@atproto/lex-cbor"
import { jsonToLex } from "@atproto/lex-json"
import { fromBase64 } from "@atproto/lex-data"

const CREATED_VIA = "app.certified.signature.defs#createdVia"

class Fail extends Error {}

async function getJson(url) {
  const res = await fetch(url, { redirect: "error" })
  if (!res.ok) throw new Fail(`${url} -> ${res.status}`)
  return res.json()
}

function didWebUrl(did) {
  const id = did.slice("did:web:".length)
  if (id.includes(":")) throw new Fail(`path-form did:web is not supported in atproto: ${did}`)
  const host = decodeURIComponent(id)
  const hostname = host.replace(/:\d+$/, "")
  if (hostname === "localhost" || /^[\d.]+$/.test(hostname) || hostname.startsWith("[")) {
    throw new Fail(`did:web must name a public hostname: ${did}`)
  }
  return `https://${host}/.well-known/did.json`
}

async function resolveDidDoc(did) {
  if (did.startsWith("did:plc:")) return getJson(`https://plc.directory/${did}`)
  if (did.startsWith("did:web:")) return getJson(didWebUrl(did))
  throw new Fail(`unsupported DID method: ${did}`)
}

function findKey(doc, keyRef) {
  const fragment = keyRef.split("#")[1]
  const methods = [...(doc.verificationMethod ?? []), ...(doc.assertionMethod ?? [])]
  return methods.find(
    (m) => typeof m === "object" && (m.id === keyRef || m.id === `#${fragment}`),
  )
}

async function verifyEntry(entry, rest, repo) {
  if (typeof entry.key !== "string" || !entry.key.includes("#")) {
    throw new Fail("entry has no full key reference")
  }
  if (typeof entry.signature?.$bytes !== "string") throw new Fail("entry has no signature bytes")
  const [keyDid] = entry.key.split("#")
  const method = findKey(await resolveDidDoc(keyDid), entry.key)
  if (!method?.publicKeyMultibase) throw new Fail(`key ${entry.key} not found in ${keyDid}`)

  const { signature, ...sigMeta } = entry
  const unsigned = { ...rest, $sig: { ...sigMeta, repository: repo } }
  const cid = await cidForLex(jsonToLex(unsigned, { strict: true }))
  return verifySignature(
    `did:key:${method.publicKeyMultibase}`,
    cid.bytes,
    fromBase64(signature.$bytes),
  )
}

async function main(atUri) {
  const match = atUri?.match(/^at:\/\/(did:[^/]+)\/([^/]+)\/([^/]+)$/)
  if (!match) throw new Fail("usage: verify-created-via.mjs at://<did>/<collection>/<rkey>")
  const [, repo, collection, rkey] = match

  const repoDoc = await resolveDidDoc(repo)
  // DID documents may reference the service by fragment or by full DID URL.
  const pds = repoDoc.service?.find(
    (s) => s.id === "#atproto_pds" || s.id === `${repo}#atproto_pds`,
  )?.serviceEndpoint
  if (!pds) throw new Fail(`no #atproto_pds service for ${repo}`)

  const qs = new URLSearchParams({ repo, collection, rkey })
  const { cid, value } = await getJson(`${pds}/xrpc/com.atproto.repo.getRecord?${qs}`)

  const localCid = (await cidForLex(jsonToLex(value, { strict: true }))).toString()
  if (localCid !== cid) throw new Fail(`CID mismatch: PDS ${cid}, local ${localCid}`)
  console.log(`ok   CID matches PDS (${cid})`)

  const entries = (value.signatures ?? []).filter((e) => e?.$type === CREATED_VIA)
  if (entries.length === 0) throw new Fail("no createdVia entry")
  if (entries.length > 1) console.warn(`warn ${entries.length} createdVia entries (expected at most one)`)

  const { signatures: _signatures, ...rest } = value
  let valid = 0
  for (const entry of entries) {
    try {
      if (await verifyEntry(entry, rest, repo)) {
        valid++
        console.log(`ok   ${entry.key} verifies for repository ${repo}`)
      } else {
        console.log(`bad  ${entry.key} does not verify`)
      }
    } catch (err) {
      console.log(`bad  ${entry.key ?? "(no key)"}: ${err.message}`)
    }
  }
  if (valid !== 1) throw new Fail(`${valid} valid createdVia signatures (expected exactly one)`)
}

main(process.argv[2]).catch((err) => {
  console.error(`FAIL: ${err instanceof Fail ? err.message : err?.message ?? err}`)
  process.exit(1)
})
