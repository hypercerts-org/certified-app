import {
  CertifiedProfile,
  BlueskyProfile,
  HypercertsUri,
  HypercertsSmallImage,
  HypercertsLargeImage,
  getBlobRefLink,
} from "./types";
import { authFetch } from "@/lib/auth/fetch";
import { extractError, xrpcGetRecordPath } from "@/lib/utils/api";
import { writeToRepo } from "@/lib/atproto/repo-write";

const COLLECTION = "app.certified.actor.profile";
const BSKY_COLLECTION = "app.bsky.actor.profile";
const RKEY = "self";

const MAX_AVATAR_SIZE = 4 * 1024 * 1024; // 4MB — Vercel serverless limit is ~4.5MB
const MAX_BANNER_SIZE = 4 * 1024 * 1024; // 4MB — Vercel serverless limit is ~4.5MB

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

/**
 * Get a user's profile record
 * @param did - The DID of the user whose profile to fetch
 * @returns The profile record or null if it doesn't exist
 */
export async function getProfile(
  did: string,
  signal?: AbortSignal
): Promise<CertifiedProfile | null> {
  const res = await authFetch(
    xrpcGetRecordPath({ repo: did, collection: COLLECTION, rkey: RKEY }),
    { signal }
  );
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return null;
    throw new Error(`Failed to get profile: ${res.statusText}`);
  }
  const data = await res.json();
  return data.value as CertifiedProfile;
}

/**
 * Get a user's Bluesky profile record (app.bsky.actor.profile)
 * Used as fallback when no Certified profile exists
 */
export async function getBlueskyProfile(
  did: string,
  signal?: AbortSignal
): Promise<BlueskyProfile | null> {
  const res = await authFetch(
    xrpcGetRecordPath({ repo: did, collection: BSKY_COLLECTION, rkey: RKEY }),
    { signal }
  );
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return null;
    // Don't throw for Bluesky profile — it's a fallback, not critical
    return null;
  }
  const data = await res.json();
  return data.value as BlueskyProfile;
}

/**
 * Create or update a user's profile record
 * @param did - The DID of the user whose profile to update
 * @param profile - The profile data to save
 * @param options - Optional overrides. When `targetDid` differs from the
 *   session DID (i.e. the viewer is saving a group's profile they admin),
 *   the call is routed through the group profile BFF route instead of the
 *   direct PDS XRPC putRecord. The BFF route handles the proxied write to
 *   the group service.
 */
export async function putProfile(
  did: string,
  profile: CertifiedProfile,
  options?: { targetDid?: string; swapRecord?: string }
): Promise<void> {
  const targetDid = options?.targetDid ?? did;
  const swap = options?.swapRecord;
  // Group-profile save: BFF expects the bare profile record (no
  // $type wrapper — it adds collection/rkey/$type server-side). The
  // own-DID XRPC path needs the wrapped record.
  await writeToRepo<unknown>({
    ownDid: did,
    targetDid,
    ownPath: {
      url: "/api/xrpc/com/atproto/repo/putRecord",
      method: "POST",
      body: {
        repo: did,
        collection: COLLECTION,
        rkey: RKEY,
        record: { ...profile, $type: "app.certified.actor.profile" },
        ...(swap ? { swapRecord: swap } : {}),
      },
    },
    groupPath: {
      url: `/api/groups/${encodeURIComponent(targetDid)}/profile`,
      method: "PUT",
      // BFF route reads the profile fields via pickAllowedFields
      // and `swapRecord` as a separate top-level key (swapRecord
      // isn't in PROFILE_FIELDS so the allowlist filters it from
      // the record itself — the route reads it from the raw body
      // before allowlisting and forwards as the outer arg).
      body: swap ? { ...profile, swapRecord: swap } : profile,
    },
    errorFallback: "Failed to save profile",
  });
}

/**
 * The blob descriptor returned by `com.atproto.repo.uploadBlob`. Matches
 * the lexicon's BlobRef shape ($type/ref/mimeType/size).
 */
export interface UploadedBlob {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
}

/**
 * Upload a blob (image file) to the PDS.
 *
 * When `options.targetDid` is provided and differs from the session DID,
 * the upload is routed through the group's repo via the group service
 * proxy (so the blob lands in the GROUP's repo, not the viewer's). This
 * is required for avatars/banners on group profiles the viewer admins.
 *
 * @param file - The file to upload
 * @param options.targetDid - Optional group DID to upload on behalf of
 * @returns The blob reference, typed as UploadedBlob
 */
export async function uploadBlob(
  file: File,
  options?: { targetDid?: string }
): Promise<UploadedBlob> {
  // Validate file type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      `Invalid file type: ${file.type}. Allowed types: ${ALLOWED_IMAGE_TYPES.join(", ")}`
    );
  }

  const buffer = await file.arrayBuffer();
  // Group upload path: hits the BFF route that calls
  // app.certified.group.repo.uploadBlob via the proxied agent. The
  // response shape is { blob: UploadedBlob } — same as the XRPC route.
  const url = options?.targetDid
    ? `/api/groups/${encodeURIComponent(options.targetDid)}/upload-blob`
    : "/api/xrpc/com/atproto/repo/uploadBlob";
  const res = await authFetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: buffer,
  });

  if (!res.ok) {
    throw new Error(await extractError(res, res.statusText));
  }

  const data = (await res.json()) as { blob?: UploadedBlob };
  if (!data.blob || typeof data.blob.ref?.$link !== "string") {
    throw new Error("uploadBlob response missing blob.ref.$link");
  }
  return data.blob;
}

/** Upload an avatar image (max 4MB) — returns a typed UploadedBlob.
 *  Pass `targetDid` to upload to a group repo instead of the viewer's. */
export async function uploadAvatar(
  file: File,
  options?: { targetDid?: string }
): Promise<UploadedBlob> {
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error(
      `Avatar file size exceeds maximum of ${MAX_AVATAR_SIZE / 1024 / 1024}MB`
    );
  }
  return uploadBlob(file, options);
}

/** Upload a banner image (max 4MB) — returns a typed UploadedBlob.
 *  Pass `targetDid` to upload to a group repo instead of the viewer's. */
export async function uploadBanner(
  file: File,
  options?: { targetDid?: string }
): Promise<UploadedBlob> {
  if (file.size > MAX_BANNER_SIZE) {
    throw new Error(
      `Banner file size exceeds maximum of ${MAX_BANNER_SIZE / 1024 / 1024}MB`
    );
  }
  return uploadBlob(file, options);
}

/**
 * Get the URL for a profile avatar
 * @param profile - The profile record
 * @param did - The DID of the user
 * @param pdsUrl - The PDS URL (e.g., https://certified.one)
 * @returns The avatar URL or null if no avatar is set
 */
export function getAvatarUrl(
  profile: CertifiedProfile,
  did: string,
  pdsUrl: string
): string | null {
  if (!profile.avatar) {
    return null;
  }

  // Check if it's a URI type
  if ((profile.avatar as HypercertsUri).$type === "org.hypercerts.defs#uri") {
    return (profile.avatar as HypercertsUri).uri;
  }

  // Check if it's a smallImage blob type
  if (
    (profile.avatar as HypercertsSmallImage).$type ===
    "org.hypercerts.defs#smallImage"
  ) {
    const image = (profile.avatar as HypercertsSmallImage).image;
    return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${getBlobRefLink(image.ref)}`;
  }

  return null;
}

/**
 * Build an avatar URL from the indexer's denormalised
 * `(did, avatarCid)` pair. Routes through the XRPC proxy which
 * federates to the issuer's PDS via repo resolution — same pattern
 * `getAvatarUrl` above uses for a record-side blob ref.
 *
 * Used by render sites that consume an indexer payload directly
 * (e.g. profile-endorsements / profile-overview cards reading the
 * `issuer { avatarCid }` block from magic-indexer #96) instead of
 * resolving via `useAuthorInfo`.
 *
 * `cid` is validated as alphanumeric (base32 / base58 — CIDs never
 * contain slashes or path-traversal characters) so a compromised
 * indexer can't inject path-traversal into the URL we mount. Round-1
 * security review NOTE on #69 — cheap defense in depth.
 */
export function buildAvatarUrlFromCid(
  did: string | null | undefined,
  cid: string | null | undefined,
): string | null {
  if (!did || !cid) return null
  if (!/^[A-Za-z0-9]+$/.test(cid)) return null
  return `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
}

/**
 * Get the URL for a profile banner
 * @param profile - The profile record
 * @param did - The DID of the user
 * @param pdsUrl - The PDS URL (e.g., https://certified.one)
 * @returns The banner URL or null if no banner is set
 */
export function getBannerUrl(
  profile: CertifiedProfile,
  did: string,
  pdsUrl: string
): string | null {
  if (!profile.banner) {
    return null;
  }

  // Check if it's a URI type
  if ((profile.banner as HypercertsUri).$type === "org.hypercerts.defs#uri") {
    return (profile.banner as HypercertsUri).uri;
  }

  // Check if it's a largeImage blob type
  if (
    (profile.banner as HypercertsLargeImage).$type ===
    "org.hypercerts.defs#largeImage"
  ) {
    const image = (profile.banner as HypercertsLargeImage).image;
    return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${getBlobRefLink(image.ref)}`;
  }

  return null;
}
