import {
  CertifiedProfile,
  BlueskyProfile,
  HypercertsUri,
  HypercertsSmallImage,
  HypercertsLargeImage,
  getBlobRefLink,
} from "./types";
import { authFetch } from "@/lib/auth/fetch";
import { extractError } from "@/lib/utils/api";

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
    `/api/xrpc/com/atproto/repo/getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(COLLECTION)}&rkey=${encodeURIComponent(RKEY)}`,
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
    `/api/xrpc/com/atproto/repo/getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(BSKY_COLLECTION)}&rkey=${encodeURIComponent(RKEY)}`,
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
 */
export async function putProfile(
  did: string,
  profile: CertifiedProfile
): Promise<void> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/putRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: did,
      collection: COLLECTION,
      rkey: RKEY,
      record: {
        ...profile,
        $type: "app.certified.actor.profile",
      },
    }),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, res.statusText));
  }
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
 * Upload a blob (image file) to the PDS
 * @param file - The file to upload
 * @returns The blob reference, typed as UploadedBlob
 */
export async function uploadBlob(file: File): Promise<UploadedBlob> {
  // Validate file type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      `Invalid file type: ${file.type}. Allowed types: ${ALLOWED_IMAGE_TYPES.join(", ")}`
    );
  }

  const buffer = await file.arrayBuffer();
  const res = await authFetch("/api/xrpc/com/atproto/repo/uploadBlob", {
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

/** Upload an avatar image (max 4MB) — returns a typed UploadedBlob. */
export async function uploadAvatar(file: File): Promise<UploadedBlob> {
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error(
      `Avatar file size exceeds maximum of ${MAX_AVATAR_SIZE / 1024 / 1024}MB`
    );
  }
  return uploadBlob(file);
}

/** Upload a banner image (max 4MB) — returns a typed UploadedBlob. */
export async function uploadBanner(file: File): Promise<UploadedBlob> {
  if (file.size > MAX_BANNER_SIZE) {
    throw new Error(
      `Banner file size exceeds maximum of ${MAX_BANNER_SIZE / 1024 / 1024}MB`
    );
  }
  return uploadBlob(file);
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
