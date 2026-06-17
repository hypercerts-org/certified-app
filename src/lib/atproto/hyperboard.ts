/**
 * Data + write layer for the Contributor Board (org.hyperboards.*).
 *
 * Reads go through the XRPC proxy (which federates listRecords/getRecord to
 * any PDS); writes go through the proxy's own-repo create/put. Board editing
 * is scoped to the activity author's own repo — see the Contributor Board
 * docs for the group-repo follow-up.
 *
 * `buildBoardEntries` is a pure merge of the activity contributors with the
 * board config, each contributor's displayProfile, and their actor profile,
 * applying the precedence:
 *
 *   contributorConfig(override) → displayProfile → actor.profile
 *     → contributorConfig(fallback) → contributorInformation → generated
 */
import { authFetch } from "@/lib/auth/fetch"
import { extractError, xrpcGetRecordPath } from "@/lib/utils/api"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { getBlobRefLink } from "@/lib/atproto/types"
import { parseAtUri } from "@/lib/urls"
import { isDid } from "@/lib/utils/did"
import { createBoundedCache } from "@/lib/utils/bounded-cache"
import type {
  StrongRef,
  ContributorIdentity,
  ActivityContributor,
} from "./activity-types"
import {
  BOARD_NSID,
  DISPLAY_PROFILE_NSID,
  CONTRIBUTOR_INFORMATION_NSID,
  type BoardRecord,
  type BoardConfig,
  type ContributorConfig,
  type DisplayProfileRecord,
  type ContributorInformationRecord,
  type BoardImage,
  type BoardVideo,
  type BoardWithRef,
  type BoardEntry,
} from "./hyperboard-types"

// ---------------------------------------------------------------------------
// Image / video URL resolution
// ---------------------------------------------------------------------------

interface RawUnion {
  $type?: string
  uri?: unknown
  image?: { ref?: unknown }
  video?: { ref?: unknown }
}

/**
 * Resolve a board image union (`org.hypercerts.defs#uri | #smallImage`) to a
 * loadable URL. Blob refs resolve through the getBlob proxy against the repo
 * that holds them (`ownerDid`). Tolerant of records missing `$type`.
 */
export function boardImageUrl(
  image: BoardImage | undefined | null,
  ownerDid: string | null,
): string | null {
  if (!image) return null
  const u = image as RawUnion
  if (typeof u.uri === "string") return u.uri
  if (u.image && "ref" in u.image) {
    return buildAvatarUrlFromCid(ownerDid, getBlobRefLink(u.image.ref))
  }
  return null
}

/** Resolve a contributor video union to a loadable URL (uri or blob). */
export function boardVideoUrl(
  video: BoardVideo | undefined | null,
  ownerDid: string | null,
): string | null {
  if (!video) return null
  const u = video as RawUnion
  if (typeof u.uri === "string") return u.uri
  if (u.video && "ref" in u.video) {
    return buildAvatarUrlFromCid(ownerDid, getBlobRefLink(u.video.ref))
  }
  return null
}

/** Parse a contribution weight into a positive tile value (fallback 1). */
export function parseWeight(weight: string | undefined | null): number {
  const n = parseFloat((weight ?? "").trim())
  return Number.isFinite(n) && n > 0 ? n : 1
}

// ---------------------------------------------------------------------------
// Record parsing (defensive — records are user-authored)
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function asStrongRef(v: unknown): StrongRef | null {
  if (!isObj(v)) return null
  return typeof v.uri === "string" && typeof v.cid === "string"
    ? { uri: v.uri, cid: v.cid }
    : null
}

/** Parse a raw record value into a BoardRecord (or null when malformed). */
export function parseBoardRecord(value: unknown): BoardRecord | null {
  if (!isObj(value)) return null
  const subject = asStrongRef(value.subject)
  if (!subject) return null
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : ""

  const board: BoardRecord = { subject, createdAt }

  if (isObj(value.config)) board.config = value.config as BoardConfig

  if (Array.isArray(value.contributorConfigs)) {
    const configs: ContributorConfig[] = []
    for (const raw of value.contributorConfigs) {
      if (!isObj(raw)) continue
      const ref = asStrongRef(raw.contributor)
      const identity =
        isObj(raw.contributor) && typeof raw.contributor.identity === "string"
          ? { identity: raw.contributor.identity }
          : null
      const contributor = ref ?? identity
      if (!contributor) continue
      configs.push({ ...(raw as unknown as ContributorConfig), contributor })
    }
    board.contributorConfigs = configs
  }

  return board
}

function parseDisplayProfile(value: unknown): DisplayProfileRecord | null {
  if (!isObj(value)) return null
  return value as unknown as DisplayProfileRecord
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface ListedRecord {
  uri: string
  cid: string
  value: unknown
}

/** List up to `max` records of a collection from any repo via the proxy. */
async function listRecords(
  repo: string,
  collection: string,
  max = 300,
): Promise<ListedRecord[]> {
  const out: ListedRecord[] = []
  let cursor: string | undefined
  do {
    const params = new URLSearchParams({ repo, collection, limit: "100" })
    if (cursor) params.set("cursor", cursor)
    const res = await authFetch(
      `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    )
    if (!res.ok) break
    const data = (await res.json()) as {
      records?: ListedRecord[]
      cursor?: string
    }
    if (Array.isArray(data.records)) out.push(...data.records)
    cursor = data.cursor
  } while (cursor && out.length < max)
  return out
}

const boardCache = createBoundedCache<string, BoardWithRef | null>(200)

/** Drop the cached board for an activity so the next read re-fetches. */
export function invalidateBoardForActivity(activityUri: string): void {
  boardCache.delete(activityUri)
}

/**
 * Find the board the activity author created for this activity: the
 * org.hyperboards.board in the author's repo whose `subject.uri` matches.
 * Returns null when none exists (the tab then renders a default board).
 */
export async function fetchBoardForActivity(
  authorDid: string,
  activityUri: string,
): Promise<BoardWithRef | null> {
  const cached = boardCache.get(activityUri)
  if (cached !== undefined) return cached

  const records = await listRecords(authorDid, BOARD_NSID)
  let result: BoardWithRef | null = null
  for (const rec of records) {
    const subject = isObj(rec.value) ? asStrongRef(rec.value.subject) : null
    if (subject?.uri !== activityUri) continue
    const board = parseBoardRecord(rec.value)
    if (!board) continue
    const parsed = parseAtUri(rec.uri)
    result = {
      uri: rec.uri,
      cid: rec.cid,
      rkey: parsed?.rkey ?? "",
      did: parsed?.did ?? authorDid,
      board,
    }
    break
  }
  boardCache.set(activityUri, result)
  return result
}

const displayProfileCache = createBoundedCache<
  string,
  DisplayProfileRecord | null
>(500)

/** Drop a cached displayProfile so the next read re-fetches (after edit). */
export function invalidateDisplayProfile(did: string): void {
  displayProfileCache.delete(did)
}

/** Fetch a user's own org.hyperboards.displayProfile (rkey self). */
export async function fetchDisplayProfile(
  did: string,
): Promise<DisplayProfileRecord | null> {
  const cached = displayProfileCache.get(did)
  if (cached !== undefined) return cached
  let result: DisplayProfileRecord | null = null
  try {
    const res = await authFetch(
      xrpcGetRecordPath({
        repo: did,
        collection: DISPLAY_PROFILE_NSID,
        rkey: "self",
      }),
    )
    if (res.ok) {
      const data = (await res.json()) as { value?: unknown }
      result = parseDisplayProfile(data.value)
    }
  } catch {
    result = null
  }
  displayProfileCache.set(did, result)
  return result
}

/**
 * Batch-fetch all contributorInformation records in the author's repo,
 * keyed by record uri — for O(1) lookup when building entries (mirrors the
 * way the activity's strongRef contributors point into the author's PDS).
 */
export async function fetchContributorInfoMap(
  authorDid: string,
): Promise<Map<string, ContributorInformationRecord>> {
  const map = new Map<string, ContributorInformationRecord>()
  const records = await listRecords(authorDid, CONTRIBUTOR_INFORMATION_NSID)
  for (const rec of records) {
    if (isObj(rec.value)) {
      map.set(rec.uri, rec.value as unknown as ContributorInformationRecord)
    }
  }
  return map
}

/** Fetch a contributorInformation record by its at:// uri. */
export async function fetchContributorInformation(
  uri: string,
): Promise<ContributorInformationRecord | null> {
  const parsed = parseAtUri(uri)
  if (!parsed) return null
  try {
    const res = await authFetch(
      xrpcGetRecordPath({
        repo: parsed.did,
        collection: parsed.collection,
        rkey: parsed.rkey,
      }),
    )
    if (!res.ok) return null
    const data = (await res.json()) as { value?: unknown }
    return isObj(data.value)
      ? (data.value as unknown as ContributorInformationRecord)
      : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Entry merge (pure)
// ---------------------------------------------------------------------------

export interface ResolvedContributorProfile {
  did: string
  displayName: string | null
  avatarUrl: string | null
}

export interface BuildEntriesInput {
  contributors: ActivityContributor[]
  board: BoardRecord | null
  /** the activity author's DID — owner of the board + contributorInfo blobs */
  boardDid: string
  /** contributorInformation records keyed by strongRef uri */
  contributorInfo: Map<string, ContributorInformationRecord>
  /** actor profiles keyed by the contributor's identity string (did/handle) */
  resolved: Map<string, ResolvedContributorProfile>
  /** displayProfiles keyed by the contributor's DID */
  displayProfiles: Map<string, DisplayProfileRecord>
}

function configKey(contributor: StrongRef | ContributorIdentity): string {
  return "uri" in contributor ? contributor.uri : contributor.identity
}

function identityString(
  identity: ContributorIdentity | StrongRef,
  info: ContributorInformationRecord | null,
): string | null {
  if ("identity" in identity) return identity.identity || null
  return info?.identifier ?? null
}

/** First defined value in the precedence chain. */
function pick<T>(...candidates: (T | null | undefined)[]): T | null {
  for (const c of candidates) {
    if (c !== null && c !== undefined && c !== "") return c
  }
  return null
}

/**
 * Merge activity contributors + board config + per-contributor displayProfile
 * + actor profile into render-ready tiles. Pure — all async resolution is done
 * by the caller (use-hyperboard) and passed in via the maps.
 */
export function buildBoardEntries(input: BuildEntriesInput): BoardEntry[] {
  const { contributors, board, boardDid, contributorInfo, resolved } = input
  const circular = (board?.config?.imageShape ?? "circular") === "circular"

  const configByKey = new Map<string, ContributorConfig>()
  for (const cfg of board?.contributorConfigs ?? []) {
    configByKey.set(configKey(cfg.contributor), cfg)
  }

  return contributors.map((contributor, index) => {
    const identity = contributor.contributorIdentity
    const isRef = "uri" in identity
    const contributorUri = isRef ? identity.uri : null
    const info = contributorUri
      ? contributorInfo.get(contributorUri) ?? null
      : null

    const idStr = identityString(identity, info)
    const profile = idStr ? resolved.get(idStr) ?? null : null
    const did = profile?.did ?? (idStr && isDid(idStr) ? idStr : null)
    const displayProfile = did ? input.displayProfiles.get(did) ?? null : null

    const cfg =
      (contributorUri ? configByKey.get(contributorUri) : undefined) ??
      (idStr ? configByKey.get(idStr) : undefined)
    const override = cfg?.override === true

    // Per-field precedence. Override values short-circuit to the top.
    const name =
      pick(
        override ? cfg?.displayName : null,
        displayProfile?.displayName,
        profile?.displayName,
        cfg?.displayName,
        info?.displayName,
        info?.identifier,
        idStr,
      ) ?? "Unknown contributor"

    const imageUrl = pick(
      override ? boardImageUrl(cfg?.image, boardDid) : null,
      boardImageUrl(displayProfile?.image, did),
      profile?.avatarUrl,
      boardImageUrl(cfg?.image, boardDid),
      boardImageUrl(info?.image, boardDid),
    )

    const videoUrl = pick(
      override ? boardVideoUrl(cfg?.video, boardDid) : null,
      boardVideoUrl(displayProfile?.video, did),
      boardVideoUrl(cfg?.video, boardDid),
    )

    const hoverImageUrl = pick(
      override ? boardImageUrl(cfg?.hoverImage, boardDid) : null,
      boardImageUrl(displayProfile?.hoverImage, did),
      boardImageUrl(cfg?.hoverImage, boardDid),
    )

    const hoverIframeUrl = pick(
      override ? cfg?.hoverIframeUrl : null,
      displayProfile?.hoverIframeUrl,
      cfg?.hoverIframeUrl,
    )

    const url = pick(
      override ? cfg?.url : null,
      displayProfile?.url,
      cfg?.url,
    )

    return {
      key: contributorUri ?? idStr ?? `contributor-${index}`,
      index,
      identity,
      contributorUri,
      did,
      name,
      value: parseWeight(contributor.contributionWeight),
      imageUrl,
      videoUrl,
      hoverImageUrl,
      hoverIframeUrl,
      url,
      circular,
    }
  })
}

// ---------------------------------------------------------------------------
// Writes (own-repo, via the XRPC proxy)
// ---------------------------------------------------------------------------

async function xrpcCreate(
  ownDid: string,
  collection: string,
  record: Record<string, unknown>,
): Promise<{ uri: string; cid: string }> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: ownDid, collection, record }),
  })
  if (!res.ok) throw new Error(await extractError(res, "Failed to create record"))
  return (await res.json()) as { uri: string; cid: string }
}

async function xrpcPut(
  ownDid: string,
  collection: string,
  rkey: string,
  record: Record<string, unknown>,
  swapRecord?: string,
): Promise<{ uri: string; cid: string }> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/putRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: ownDid,
      collection,
      rkey,
      record,
      ...(swapRecord ? { swapRecord } : {}),
    }),
  })
  if (!res.ok) throw new Error(await extractError(res, "Failed to save record"))
  return (await res.json()) as { uri: string; cid: string }
}

/** Create a contributorInformation record; returns its strongRef. */
export async function createContributorInformation(
  ownDid: string,
  record: { identifier?: string; displayName?: string; image?: BoardImage },
): Promise<StrongRef> {
  const { uri, cid } = await xrpcCreate(ownDid, CONTRIBUTOR_INFORMATION_NSID, {
    $type: CONTRIBUTOR_INFORMATION_NSID,
    ...record,
    createdAt: new Date().toISOString(),
  })
  return { uri, cid }
}

/** Create a new org.hyperboards.board record (server assigns the rkey). */
export async function createBoardRecord(
  ownDid: string,
  record: Omit<BoardRecord, "$type">,
): Promise<{ uri: string; cid: string }> {
  return xrpcCreate(ownDid, BOARD_NSID, { $type: BOARD_NSID, ...record })
}

/** Update an existing org.hyperboards.board record by rkey. */
export async function putBoardRecord(
  ownDid: string,
  rkey: string,
  record: Omit<BoardRecord, "$type">,
  swapRecord?: string,
): Promise<{ uri: string; cid: string }> {
  return xrpcPut(
    ownDid,
    BOARD_NSID,
    rkey,
    { $type: BOARD_NSID, ...record },
    swapRecord,
  )
}

/** Create or update the viewer's own displayProfile (rkey self). */
export async function putDisplayProfile(
  ownDid: string,
  record: Omit<DisplayProfileRecord, "$type" | "createdAt"> & {
    createdAt?: string
  },
): Promise<{ uri: string; cid: string }> {
  const result = await xrpcPut(ownDid, DISPLAY_PROFILE_NSID, "self", {
    $type: DISPLAY_PROFILE_NSID,
    ...record,
    createdAt: record.createdAt ?? new Date().toISOString(),
  })
  invalidateDisplayProfile(ownDid)
  return result
}
