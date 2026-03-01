import {
  CertifiedProfile,
  HypercertsUri,
  HypercertsSmallImage,
  HypercertsLargeImage,
} from "./types";
import { authFetch } from "@/lib/auth/fetch";

const COLLECTION = "app.certified.actor.profile";
const RKEY = "self";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_BANNER_SIZE = 10 * 1024 * 1024; // 10MB

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
  did: string
): Promise<CertifiedProfile | null> {
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(COLLECTION)}&rkey=${encodeURIComponent(RKEY)}`
  );
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return null;
    throw new Error(`Failed to get profile: ${res.statusText}`);
  }
  const data = await res.json();
  return data.value as CertifiedProfile;
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
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || res.statusText);
  }
}

/**
 * Upload a blob (image file) to the PDS
 * @param file - The file to upload
 * @returns The blob reference as a plain object
 */
export async function uploadBlob(
  file: File
): Promise<Record<string, unknown>> {
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
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || res.statusText);
  }

  const data = await res.json();
  return data.blob as Record<string, unknown>;
}

/**
 * Upload an avatar image (max 5MB)
 * @param file - The avatar image file
 * @returns The blob reference as a plain object
 */
export async function uploadAvatar(
  file: File
): Promise<Record<string, unknown>> {
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error(
      `Avatar file size exceeds maximum of ${MAX_AVATAR_SIZE / 1024 / 1024}MB`
    );
  }
  return uploadBlob(file);
}

/**
 * Upload a banner image (max 10MB)
 * @param file - The banner image file
 * @returns The blob reference as a plain object
 */
export async function uploadBanner(
  file: File
): Promise<Record<string, unknown>> {
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
 * @param pdsUrl - The PDS URL (e.g., https://epds1.test.certified.app)
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
    return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${(image.ref as unknown as { $link: string })["$link"]}`;
  }

  return null;
}

/**
 * Get the URL for a profile banner
 * @param profile - The profile record
 * @param did - The DID of the user
 * @param pdsUrl - The PDS URL (e.g., https://epds1.test.certified.app)
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
    return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${(image.ref as unknown as { $link: string })["$link"]}`;
  }

  return null;
}
