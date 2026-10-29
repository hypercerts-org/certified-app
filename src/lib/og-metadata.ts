import type { Metadata } from "next"
import { unstable_cache } from "next/cache"
import { notFound } from "next/navigation"
import { buildProfilePayload } from "@/app/api/resolve-did/resolve-core"
import { BSKY_APPVIEW, resolveHandle, resolveHandleViaWellKnown } from "@/lib/atproto/did"
import { getRecordServer } from "@/lib/atproto/get-record-server"
import { parseActor, profileUrl, recordUrl, type RecordType } from "@/lib/urls"

// Generic share defaults. The per-page builders below only fall back to
// these when the entity carries no specific value of its own.
const SITE_NAME = "Certified"
const DEFAULT_OG_IMAGE = "/assets/certs-hero-1200x630.png"
const TWITTER_HANDLE = "@hypercerts"

// `generateMetadata` runs on the TTFB-critical path, and social scrapers /
// crawlers hit the same profile & record URLs repeatedly. Cache the DID-keyed
// upstream resolution briefly so repeat hits collapse onto one fetch instead
// of re-issuing the indexer + PDS round-trips every request. `unstable_cache`
// (rather than per-fetch `next: { revalidate }`) is required because
// `buildProfilePayload` issues an indexer POST, and Next never data-caches
// POST fetches. OG previews are then at most a few minutes stale after an edit.
const OG_REVALIDATE_SECONDS = 300

const cachedProfilePayload = unstable_cache(
  (did: string) => buildProfilePayload(did),
  ["og-metadata:profile-payload"],
  { revalidate: OG_REVALIDATE_SECONDS },
)

const cachedRecord = unstable_cache(
  (did: string, collection: string, rkey: string) =>
    getRecordServer<Record<string, unknown>>(did, collection, rkey),
  ["og-metadata:record"],
  { revalidate: OG_REVALIDATE_SECONDS },
)

/** Collapse whitespace and cap a description at OG-friendly length. */
function clampDescription(text: string | null | undefined, max = 200): string | undefined {
  if (!text) return undefined
  const flat = text.replace(/\s+/g, " ").trim()
  if (!flat) return undefined
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** A blob `ref` as it arrives in raw getRecord JSON: `{ $link: "bafy…" }`. */
function blobLink(ref: unknown): string | null {
  if (ref && typeof ref === "object" && "$link" in ref) {
    const link = (ref as { $link?: unknown }).$link
    if (typeof link === "string") return link
  }
  return null
}

/**
 * Best-effort OG image URL for a record's polymorphic `image` field. Mirrors
 * `resolveActivityImageUrl` but is self-contained (no client-import chain) and
 * skips `data:` URIs, which crawlers can't fetch as `og:image`.
 */
function ogImageFromField(image: unknown, did: string): string | null {
  if (image == null) return null
  if (typeof image === "string") {
    return /^https?:\/\//.test(image) ? image : null
  }
  if (typeof image !== "object") return null
  const obj = image as Record<string, unknown>

  if (typeof obj.uri === "string" && obj.uri) {
    return /^https?:\/\//.test(obj.uri) ? obj.uri : null
  }
  // { image: { ref: { $link } } } (smallImage / largeImage)
  const nested = obj.image as { ref?: unknown } | undefined
  const nestedCid = nested ? blobLink(nested.ref) : null
  if (nestedCid) {
    return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(nestedCid)}`
  }
  // bare blob ref { ref: { $link } }
  const bareCid = blobLink(obj.ref)
  if (bareCid) {
    return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(bareCid)}`
  }
  return null
}

type ActorLookup =
  | { status: "found"; did: string; handle: string | null }
  | { status: "missing" }
  | { status: "unknown" }

const LOOKUP_TIMEOUT_MS = 5_000

/** A did:plc's existence per plc.directory: false only on a definite 404/410. */
async function plcDidExists(did: string): Promise<boolean | undefined> {
  try {
    const res = await fetch(`https://plc.directory/${encodeURIComponent(did)}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
    if (res.ok) return true
    if (res.status === 404 || res.status === 410) return false
  } catch {
    // Network trouble: unknown.
  }
  return undefined
}

/** Handle → DID via the public appView: the DID, "missing" on its definite
 *  "Unable to resolve handle", or undefined when the lookup failed. */
async function resolveHandleStrict(handle: string): Promise<string | "missing" | undefined> {
  try {
    const res = await fetch(
      `${BSKY_APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
      { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    )
    if (res.ok) {
      const data = (await res.json()) as { did?: unknown }
      return typeof data.did === "string" && data.did.startsWith("did:") ? data.did : undefined
    }
    if (res.status === 400) {
      const data = (await res.json().catch(() => ({}))) as { message?: unknown }
      if (typeof data.message === "string" && /unable to resolve handle/i.test(data.message)) {
        return "missing"
      }
    }
  } catch {
    // Network trouble: unknown.
  }
  return undefined
}

/**
 * Resolve an `[actor]` segment (handle or DID). "missing" only on a definite
 * signal (invalid segment, plc.directory 404, appView "Unable to resolve
 * handle" with no .well-known fallback), so a transient upstream failure
 * never turns a real profile into a 404.
 */
async function lookupActor(actorParam: string): Promise<ActorLookup> {
  const actor = parseActor(actorParam)
  if (actor.kind === "invalid") return { status: "missing" }
  if (actor.kind === "did") {
    if (actor.value.startsWith("did:plc:") && (await plcDidExists(actor.value)) === false) {
      return { status: "missing" }
    }
    return { status: "found", did: actor.value, handle: null }
  }
  const viaAppview = await resolveHandleStrict(actor.value)
  if (viaAppview && viaAppview !== "missing") {
    return { status: "found", did: viaAppview, handle: actor.value }
  }
  // Handles the appView doesn't know yet (e.g. self-hosted, not crawled).
  const viaWellKnown = await resolveHandleViaWellKnown(actor.value)
  if (viaWellKnown) return { status: "found", did: viaWellKnown, handle: actor.value }
  return viaAppview === "missing" ? { status: "missing" } : { status: "unknown" }
}

/** Assemble a complete, self-contained Metadata object for a share target. */
function buildShareMetadata(opts: {
  title: string
  description?: string
  url: string
  image: string | null
  imageAlt: string
  ogType: "profile" | "article"
}): Metadata {
  const image = opts.image ?? DEFAULT_OG_IMAGE
  // openGraph/twitter are replaced wholesale by the deepest segment that
  // sets them (Next.js does not deep-merge them across segments), so each
  // builder returns the full object rather than a partial override.
  return {
    // Absolute: record routes sit below the [actor] layout, whose plain
    // string title stops the root "%s — Certified" template from reaching
    // them. Social cards (below) keep the bare title.
    title: { absolute: `${opts.title} — ${SITE_NAME}` },
    description: opts.description,
    openGraph: {
      title: opts.title,
      description: opts.description,
      siteName: SITE_NAME,
      locale: "en_US",
      type: opts.ogType,
      url: opts.url,
      images: [{ url: image, width: 1200, height: 630, alt: opts.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      title: opts.title,
      description: opts.description,
      images: [image],
    },
  }
}

/**
 * Per-page Open Graph metadata for a profile route (`/[actor]`). Resolves the
 * actor to its Certified profile and surfaces the display name, bio, and
 * avatar/banner so a shared profile link renders that person — not the
 * generic "Certified" card. Returns `{}` (inherit the root defaults) when the
 * actor can't be resolved.
 */
export async function profileMetadata(actorParam: string): Promise<Metadata> {
  // A profile that doesn't exist answers 404 (crawlers wait for metadata;
  // for streamed responses Next injects noindex), so made-up handles aren't
  // indexed as soft 404s. Outside the try: notFound() throws.
  const resolved = await lookupActor(actorParam)
  if (resolved.status === "missing") notFound()
  if (resolved.status !== "found") return {}
  try {
    const profile = await cachedProfilePayload(resolved.did)
    const handle = profile.handle || resolved.handle || resolved.did
    const name = profile.displayName?.trim() || handle

    const title = profile.displayName?.trim()
      ? `${profile.displayName.trim()} (@${handle})`
      : `@${handle}`
    const description =
      clampDescription(profile.description) ??
      `${name} on Certified — one account, any app.`

    return buildShareMetadata({
      title,
      description,
      url: profileUrl(handle),
      image: profile.banner ?? profile.avatar ?? null,
      imageAlt: `${name} on Certified`,
      ogType: "profile",
    })
  } catch {
    return {}
  }
}

/**
 * Per-page Open Graph metadata for a record route
 * (`/[actor]/{activity|project}/{rkey}`). Fetches the record server-side and
 * surfaces its title, short description, and image. Returns `{}` (inherit the
 * root defaults) when the record can't be resolved.
 */
export async function recordMetadata(
  actorParam: string,
  type: RecordType,
  collection: string,
  rkey: string,
): Promise<Metadata> {
  const resolved = await lookupActor(actorParam)
  if (resolved.status === "missing") notFound()
  if (resolved.status !== "found") return {}
  try {
    const { did } = resolved

    const record = await cachedRecord(did, collection, rkey)
    if (!record) return {}
    const value = record.value

    const handle = resolved.handle ?? (await resolveHandle(did).catch(() => null)) ?? did
    const byline = `@${handle} on Certified`

    if (type === "activity") {
      const rawTitle = typeof value.title === "string" ? value.title.trim() : ""
      const title = rawTitle || "Activity"
      const description =
        clampDescription(
          typeof value.shortDescription === "string" ? value.shortDescription : undefined,
        ) ?? `An activity by ${byline}.`
      return buildShareMetadata({
        title,
        description,
        url: recordUrl(handle, type, rkey),
        image: ogImageFromField(value.image, did),
        imageAlt: title,
        ogType: "article",
      })
    }

    // project / collection
    const rawTitle =
      (typeof value.title === "string" && value.title.trim()) ||
      (typeof value.name === "string" && value.name.trim()) ||
      ""
    const title = rawTitle || "Project"
    const description =
      clampDescription(
        (typeof value.shortDescription === "string" && value.shortDescription) ||
          (typeof value.description === "string" && value.description) ||
          undefined,
      ) ?? `A project by ${byline}.`
    return buildShareMetadata({
      title,
      description,
      url: recordUrl(handle, type, rkey),
      image: ogImageFromField(value.image, did),
      imageAlt: title,
      ogType: "article",
    })
  } catch {
    return {}
  }
}
