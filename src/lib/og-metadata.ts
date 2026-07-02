import type { Metadata } from "next"
import { unstable_cache } from "next/cache"
import { buildProfilePayload } from "@/app/api/resolve-did/resolve-core"
import { resolveHandle, resolveHandleToDid, resolveHandleViaWellKnown } from "@/lib/atproto/did"
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

/** Resolve an `[actor]` segment (handle or DID) to a DID, best-effort. */
async function actorToDid(actorParam: string): Promise<{ did: string; handle: string | null } | null> {
  const actor = parseActor(actorParam)
  if (actor.kind === "invalid") return null
  if (actor.kind === "did") return { did: actor.value, handle: null }
  // handle → DID via the public appView, falling back to .well-known.
  const did =
    (await resolveHandleToDid(actor.value)) ??
    (await resolveHandleViaWellKnown(actor.value))
  if (!did) return null
  return { did, handle: actor.value }
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
    title: opts.title,
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
  try {
    const resolved = await actorToDid(actorParam)
    if (!resolved) return {}

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
  try {
    const resolved = await actorToDid(actorParam)
    if (!resolved) return {}
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
