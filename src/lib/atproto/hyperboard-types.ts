/**
 * Types for the AT-Protocol hyperboard records (org.hyperboards.*), the
 * "Contributor Board" feature. Mirrors the hypercerts-org/hypercerts-lexicon
 * definitions and reuses certified-app's image unions so uploaded blobs are
 * stored the same way the rest of the app stores them.
 *
 * Records:
 *   - org.hyperboards.board          — visual config wrapping an activity
 *   - org.hyperboards.displayProfile — a user's own board appearance (rkey self)
 *   - org.hypercerts.claim.contributorInformation — a contributor's identity
 *
 * A board carries NO weight field: tile size comes from the activity's
 * contributors[].contributionWeight.
 */
import type { BlobRef } from "@atproto/api"
import type { HypercertsUri, HypercertsSmallImage } from "./types"
import type {
  StrongRef,
  ContributorIdentity,
  ActivityContributor,
} from "./activity-types"

export const BOARD_NSID = "org.hyperboards.board"
export const DISPLAY_PROFILE_NSID = "org.hyperboards.displayProfile"
export const CONTRIBUTOR_INFORMATION_NSID =
  "org.hypercerts.claim.contributorInformation"

/** A board background/contributor image: a plain URI or an uploaded blob. */
export type BoardImage = HypercertsUri | HypercertsSmallImage

/** Matches org.hypercerts.defs#smallVideo (an uploaded video blob). */
export interface HypercertsSmallVideo {
  $type: "org.hypercerts.defs#smallVideo"
  video: BlobRef
}

/** A contributor video: a URI (embed/direct link) or an uploaded blob. */
export type BoardVideo = HypercertsUri | HypercertsSmallVideo

export type AspectRatio = "16:9" | "4:3" | "1:1"
export type ImageShape = "circular" | "square"
export type BackgroundType = "image" | "iframe"

/** org.hyperboards.board#boardConfig — board-level visual settings. */
export interface BoardConfig {
  backgroundType?: BackgroundType
  /** a uri/blob union OR a bare URL string (hyperboards-v2 stores a string) */
  backgroundImage?: BoardImage | string
  backgroundIframeUrl?: string
  /** default true */
  backgroundGrayscale?: boolean
  /** opacity as a 0–1 fraction or a 0–100 percent, number or string */
  backgroundOpacity?: number | string
  /** hex string */
  backgroundColor?: string
  /** hex string */
  borderColor?: string
  /** default false — applies to contributor images */
  grayscaleImages?: boolean
  imageShape?: ImageShape
  /** default "16:9" */
  aspectRatio?: AspectRatio
}

/** org.hyperboards.board#contributorConfig — per-board styling of one person. */
export interface ContributorConfig {
  contributor: StrongRef | ContributorIdentity
  /** when true, these values win over the contributor's own profile */
  override?: boolean
  displayName?: string
  image?: BoardImage
  video?: BoardVideo
  hoverImage?: BoardImage
  hoverIframeUrl?: string
  url?: string
}

/** org.hyperboards.board record value (stored in the board creator's PDS). */
export interface BoardRecord {
  $type?: typeof BOARD_NSID
  /** StrongRef to the org.hypercerts.claim.activity (or collection) it visualizes */
  subject: StrongRef
  config?: BoardConfig
  contributorConfigs?: ContributorConfig[]
  createdAt: string
}

/** org.hyperboards.displayProfile — a user's self-declared board appearance. */
export interface DisplayProfileRecord {
  $type?: typeof DISPLAY_PROFILE_NSID
  displayName?: string
  image?: BoardImage
  video?: BoardVideo
  hoverImage?: BoardImage
  hoverIframeUrl?: string
  url?: string
  createdAt: string
}

/** org.hypercerts.claim.contributorInformation — a contributor's identity. */
export interface ContributorInformationRecord {
  $type?: typeof CONTRIBUTOR_INFORMATION_NSID
  identifier?: string
  displayName?: string
  image?: BoardImage
  createdAt: string
}

/** A board record with its location, as returned by fetchBoardForActivity. */
export interface BoardWithRef {
  uri: string
  cid: string
  rkey: string
  did: string
  board: BoardRecord
}

/**
 * A single contributor tile after merging the activity contributor with the
 * board config, the contributor's displayProfile, and their actor profile.
 * `value` drives treemap tile size; `index` ties the tile back to the
 * activity contributor it came from (so drag-to-resize can write the weight).
 */
export interface BoardEntry {
  /** stable React key + treemap id */
  key: string
  /** index into the activity's contributors[] (for weight write-back) */
  index: number
  /** the raw identity from the activity record (for matching + write-back) */
  identity: ContributorIdentity | StrongRef
  /** the contributorInformation strongRef uri, when identity is a strongRef */
  contributorUri: string | null
  /** the contributor's resolved DID, when their identity is an atproto one */
  did: string | null
  name: string
  /** contribution weight, > 0; drives tile area */
  value: number
  imageUrl: string | null
  videoUrl: string | null
  hoverImageUrl: string | null
  hoverIframeUrl: string | null
  url: string | null
  /** board-level image shape (circular vs square crop) */
  circular: boolean
}

/** Re-export for convenience at call sites that build entries. */
export type { ActivityContributor }

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  backgroundGrayscale: true,
  grayscaleImages: false,
  imageShape: "circular",
  aspectRatio: "16:9",
}
