import { Agent, BlobRef } from "@atproto/api";
import {
  CertifiedProfile,
  HypercertsUri,
  HypercertsSmallImage,
  HypercertsLargeImage,
} from "./types";

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
 * @param agent - The authenticated Agent instance
 * @param did - The DID of the user whose profile to fetch
 * @returns The profile record or null if it doesn't exist
 */
export async function getProfile(
  agent: Agent,
  did: string
): Promise<CertifiedProfile | null> {
  try {
    const response = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: COLLECTION,
      rkey: RKEY,
    });
    return response.data.value as CertifiedProfile;
  } catch (error) {
    // Handle record not found - return null instead of throwing
    if (
      (error as { status?: number })?.status === 400 ||
      (error as { message?: string })?.message?.includes("RecordNotFound") ||
      (error as { error?: string })?.error === "RecordNotFound"
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Create or update a user's profile record
 * @param agent - The authenticated Agent instance
 * @param did - The DID of the user whose profile to update
 * @param profile - The profile data to save
 */
export async function putProfile(
  agent: Agent,
  did: string,
  profile: CertifiedProfile
): Promise<void> {
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION,
    rkey: RKEY,
    record: {
      ...profile,
      $type: "app.certified.actor.profile",
    },
  });
}

/**
 * Upload a blob (image file) to the PDS
 * @param agent - The authenticated Agent instance
 * @param file - The file to upload
 * @returns The blob reference
 */
export async function uploadBlob(
  agent: Agent,
  file: File
): Promise<BlobRef> {
  // Validate file type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      `Invalid file type: ${file.type}. Allowed types: ${ALLOWED_IMAGE_TYPES.join(", ")}`
    );
  }

  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();

  // Upload blob
  const response = await agent.com.atproto.repo.uploadBlob(
    new Uint8Array(buffer),
    { encoding: file.type }
  );

  return response.data.blob;
}

/**
 * Upload an avatar image (max 5MB)
 * @param agent - The authenticated Agent instance
 * @param file - The avatar image file
 * @returns The blob reference
 */
export async function uploadAvatar(
  agent: Agent,
  file: File
): Promise<BlobRef> {
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error(
      `Avatar file size exceeds maximum of ${MAX_AVATAR_SIZE / 1024 / 1024}MB`
    );
  }
  return uploadBlob(agent, file);
}

/**
 * Upload a banner image (max 10MB)
 * @param agent - The authenticated Agent instance
 * @param file - The banner image file
 * @returns The blob reference
 */
export async function uploadBanner(
  agent: Agent,
  file: File
): Promise<BlobRef> {
  if (file.size > MAX_BANNER_SIZE) {
    throw new Error(
      `Banner file size exceeds maximum of ${MAX_BANNER_SIZE / 1024 / 1024}MB`
    );
  }
  return uploadBlob(agent, file);
}

/**
 * Get the URL for a profile avatar
 * @param profile - The profile record
 * @param did - The DID of the user
 * @param pdsUrl - The PDS URL (e.g., https://otp.certs.network)
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
    return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${image.ref.toString()}`;
  }

  return null;
}

/**
 * Get the URL for a profile banner
 * @param profile - The profile record
 * @param did - The DID of the user
 * @param pdsUrl - The PDS URL (e.g., https://otp.certs.network)
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
    return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${image.ref.toString()}`;
  }

  return null;
}
