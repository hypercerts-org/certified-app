import { BlobRef } from "@atproto/api";

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
