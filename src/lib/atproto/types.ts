import { BlobRef } from "@atproto/api";

/**
 * Extract the CID $link from a BlobRef.ref. The atproto SDK types `ref` as
 * a `CID` instance, but in practice the value can also arrive as a JSON-
 * deserialised `{ $link: string }` (e.g. when read from a getRecord
 * response that wasn't passed through the lexicon). Both shapes are
 * supported; anything else falls back to `String(ref)` which yields the
 * CID's `toString()`.
 *
 * Workaround for a magic-indexer bug (hypercerts-org/magic-indexer#110):
 * when serialising `Blob.ref` to a GraphQL `String!`, the resolver uses
 * Go's default `fmt.Sprintf("%v", m)` on the underlying map and emits
 * `map[$link:<cid>]` instead of just `<cid>`. We strip that wrapper here
 * so downstream image URLs still work on records that use the
 * lexicon-canonical `smallImage` / `largeImage` shape. Remove once the
 * indexer fixes its resolver.
 */
const INDEXER_MAP_LINK_RE = /^map\[\$link:([^\]]+)\]$/;

export function getBlobRefLink(ref: unknown): string {
  if (
    typeof ref === "object" &&
    ref !== null &&
    "$link" in ref &&
    typeof (ref as { $link: unknown }).$link === "string"
  ) {
    return (ref as { $link: string }).$link;
  }
  if (typeof ref === "string") {
    const m = ref.match(INDEXER_MAP_LINK_RE);
    if (m) return m[1];
    return ref;
  }
  return String(ref);
}

/** Helper alias for callers that have a typed BlobRef and want to read its CID. */
export function getBlobRefLinkFromBlob(ref: BlobRef["ref"]): string {
  return getBlobRefLink(ref);
}

/** Matches org.hypercerts.defs#uri */
export interface HypercertsUri {
  $type: "org.hypercerts.defs#uri";
  uri: string;
}

/** Matches org.hypercerts.defs#smallImage */
export interface HypercertsSmallImage {
  $type: "org.hypercerts.defs#smallImage";
  image: BlobRef;
}

/** Matches org.hypercerts.defs#largeImage */
export interface HypercertsLargeImage {
  $type: "org.hypercerts.defs#largeImage";
  image: BlobRef;
}

/** The profile record matching app.certified.actor.profile */
export interface CertifiedProfile {
  $type?: "app.certified.actor.profile";
  displayName?: string; // maxGraphemes: 64, maxLength: 640
  description?: string; // maxGraphemes: 256, maxLength: 2560
  pronouns?: string; // maxGraphemes: 20, maxLength: 200
  website?: string; // format: uri
  avatar?: HypercertsUri | HypercertsSmallImage;
  banner?: HypercertsUri | HypercertsLargeImage;
  createdAt?: string; // format: datetime (ISO 8601)
}

/** The profile record matching app.bsky.actor.profile */
export interface BlueskyProfile {
  $type?: "app.bsky.actor.profile";
  displayName?: string;
  description?: string;
  avatar?: { $type: string; ref: { $link: string }; mimeType: string; size: number } | { ref?: { $link: string }; [key: string]: unknown };
  banner?: { $type: string; ref: { $link: string }; mimeType: string; size: number } | { ref?: { $link: string }; [key: string]: unknown };
  createdAt?: string;
}
