// Every write the app makes, the counterpart of ./queries for reads. Callers
// authenticate and pass a Repository. When the Hypercerts SDK ships its full
// update/delete layer, these bodies will be replaced by SDK calls.
import "server-only";

import { extractPdsUrl } from "@atproto/did";
import {
  Client,
  currentDatetimeString,
  type LexMap,
  type l,
  type TypedBlobRef,
  XrpcError,
  XrpcResponseError,
} from "@atproto/lex";
import { cidForLex } from "@atproto/lex-cbor";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { app as cgsLexicons } from "@hypercerts-org/certified-group-service";
import { app, org } from "@hypercerts-org/lexicon";
import { assertWritesAllowed } from "@/lib/atproto/app-key";
import { getOAuthClient } from "@/lib/auth/oauth-client";
import { canEdit, cgs, cgsAuth } from "@/lib/cgs";
import { logError } from "@/lib/log";
import {
  avatarUrl,
  ENDORSEMENT_BADGE_TYPE,
  imageUrl,
  PLAIN_ENDORSEMENT,
  type ProfileFields,
  type ProfileVersion,
  profileUri,
} from "./views";

const profile = app.certified.actor.profile;
const organization = app.certified.actor.organization;
const badgeDefinition = app.certified.badge.definition;
const badgeAward = app.certified.badge.award;
const collection = org.hypercerts.collection;
const descriptionString = org.hypercerts.defs.descriptionString;
const smallImage = org.hypercerts.defs.smallImage;
const largeImage = org.hypercerts.defs.largeImage;

/**
 * Why a write failed. "unknown": it was sent but no answer came back
 * (timeout, dropped connection, 5xx), so it may or may not have been stored;
 * never retry blindly, read the record to find out. Every other reason means
 * nothing was written.
 */
export type WriteFailure = "conflict" | "forbidden" | "invalid" | "unknown";

/** A refused write, or one whose outcome is unknown. For "invalid", `message` is safe to show. */
export class WriteError extends Error {
  constructor(
    readonly reason: WriteFailure,
    message: string,
  ) {
    super(message);
    this.name = "WriteError";
  }
}

const conflict = () => new WriteError("conflict", "The record changed since it was read");

type TypedRecord = LexMap & { $type: l.NsidString };
type StoredRecord = { uri: string; cid: string };

/**
 * A repository the signed-in user writes to: their own, on their PDS, or an
 * organization's, through CGS. Reads always go to the repository's PDS, the
 * authoritative copy (the API's index may lag behind it).
 */
export type Repository = {
  did: l.DidString;
  getRecord(collection: l.NsidString, rkey: string): Promise<{ cid: string; value: LexMap } | null>;
  listRecords(
    collection: l.NsidString,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ records: { uri: string; cid: string; value: LexMap }[]; cursor?: string }>;
  /** Replaces the record if it is still version `swapRecord` (compare-and-swap). */
  putRecord(record: TypedRecord, rkey: string, swapRecord: string): Promise<StoredRecord>;
  /** Creates the record; fails if one exists. */
  createRecord(record: TypedRecord, rkey: string): Promise<StoredRecord>;
  /** Deletes the record, optionally checking `swapRecord`. */
  deleteRecord(collection: l.NsidString, rkey: string, swapRecord?: string): Promise<void>;
};

async function getRecordFrom(
  client: Client,
  repo: l.DidString,
  collection: l.NsidString,
  rkey: string,
) {
  try {
    const { body } = await client.getRecord(collection, rkey, { repo });
    // Without the version there is nothing to compare-and-swap against.
    if (!body.cid) throw new Error("The PDS returned the record without its CID");
    return { cid: body.cid, value: body.value };
  } catch (err) {
    if (err instanceof XrpcResponseError && err.error === "RecordNotFound") return null;
    throw err;
  }
}

async function listRecordsFrom(
  client: Client,
  repo: l.DidString,
  collection: l.NsidString,
  options?: { limit?: number; cursor?: string },
) {
  const { body } = await client.listRecords(collection, { repo, ...options });
  return { records: body.records, cursor: body.cursor };
}

/** The session user's own repository, on their PDS. */
export function ownRepository(session: OAuthSession): Repository {
  const client = new Client(session);
  return {
    did: session.did,
    getRecord: (collection, rkey) => getRecordFrom(client, session.did, collection, rkey),
    listRecords: (collection, options) => listRecordsFrom(client, session.did, collection, options),
    putRecord: async (record, rkey, swapRecord) => {
      assertWritesAllowed();
      return (await client.putRecord(record, rkey, { swapRecord })).body;
    },
    createRecord: async (record, rkey) => {
      assertWritesAllowed();
      return (await client.createRecord(record, rkey)).body;
    },
    deleteRecord: async (collection, rkey, swapRecord) => {
      assertWritesAllowed();
      await client.deleteRecord(collection, rkey, swapRecord ? { swapRecord } : undefined);
    },
  };
}

/**
 * An organization's repository, written through CGS as the session's user.
 * CGS checks their role on every write and records it in the audit log.
 */
export async function organizationRepository(
  session: OAuthSession,
  did: l.DidString,
): Promise<Repository> {
  // Read from the organization's own PDS, through the OAuth client's resolver
  // and SSRF-safe fetch: anyone can point a DID document anywhere.
  const oauthClient = await getOAuthClient();
  const { didDoc } = await oauthClient.identityResolver.resolve(did);
  const pds = new Client({ service: extractPdsUrl(didDoc), fetch: oauthClient.fetch });
  const { createRecord, deleteRecord, putRecord } = cgsLexicons.certified.group.repo;
  return {
    did,
    getRecord: (collection, rkey) => getRecordFrom(pds, did, collection, rkey),
    listRecords: (collection, options) => listRecordsFrom(pds, did, collection, options),
    putRecord: async (record, rkey, swapRecord) => {
      assertWritesAllowed();
      return cgs.call(
        putRecord,
        { repo: did, collection: record.$type, rkey, record, ...(swapRecord && { swapRecord }) },
        { headers: await cgsAuth(session, putRecord) },
      );
    },
    createRecord: async (record, rkey) => {
      assertWritesAllowed();
      return cgs.call(
        createRecord,
        { repo: did, collection: record.$type, rkey, record },
        { headers: await cgsAuth(session, createRecord) },
      );
    },
    deleteRecord: async (collection, rkey, swapRecord) => {
      assertWritesAllowed();
      await cgs.call(
        deleteRecord,
        { repo: did, collection, rkey, ...(swapRecord && { swapRecord }) },
        { headers: await cgsAuth(session, deleteRecord) },
      );
    },
  };
}

/** The repository `did`: the user's own, or an organization's through CGS. */
export async function repositoryFor(session: OAuthSession, did: l.DidString): Promise<Repository> {
  return did === session.did ? ownRepository(session) : organizationRepository(session, did);
}

/**
 * The repository `did` as the session's user may edit it: their own, or an
 * organization they manage on CGS. Null when they may not.
 */
export async function editableRepository(
  session: OAuthSession,
  did: l.DidString,
): Promise<Repository | null> {
  if (!(await canEdit(session, did))) return null;
  return did === session.did ? ownRepository(session) : organizationRepository(session, did);
}

/** The profile fields this app edits, as they appear on a record. */
function profileFields(record: LexMap | undefined): ProfileFields {
  return {
    displayName: typeof record?.displayName === "string" ? record.displayName : "",
    description: typeof record?.description === "string" ? record.description : "",
  };
}

/** The repository's profile, from its PDS; null when it has none. */
export async function getProfile(repo: Repository): Promise<ProfileVersion | null> {
  const current = await repo.getRecord(profile.$type, "self");
  return current
    ? { uri: profileUri(repo.did), cid: current.cid, ...profileFields(current.value) }
    : null;
}

/**
 * A failed write's meaning. Only a 4xx answer proves nothing was stored; a
 * 5xx (from the PDS, CGS or a proxy in front of them) or no answer at all
 * leaves the outcome unknown. Errors raised before sending (such as
 * CgsAuthError, no service-auth token) pass through as they are.
 */
function writeFailure(err: unknown): unknown {
  if (!(err instanceof XrpcError)) return err;
  if (!(err instanceof XrpcResponseError) || err.status >= 500) {
    return new WriteError("unknown", "The write's outcome is unknown");
  }
  if (err.error === "InvalidSwap") return conflict();
  if (err.status === 401 || err.status === 403) {
    return new WriteError("forbidden", "Not allowed to write this record");
  }
  return err;
}

/**
 * Sets the profile's display name and description, keeping every other field
 * as stored. `expectedCid` is the version the user edited (null: no profile
 * yet); if the profile changed since, this throws a WriteError with reason
 * "conflict" instead of overwriting.
 */
export async function updateProfile(
  repo: Repository,
  fields: ProfileFields,
  expectedCid: string | null,
): Promise<ProfileVersion> {
  const current = await repo.getRecord(profile.$type, "self");
  if ((current?.cid ?? null) !== expectedCid) throw conflict();

  const record: LexMap = {
    ...current?.value,
    $type: profile.$type,
    createdAt: current?.value.createdAt ?? currentDatetimeString(),
  };
  for (const name of ["displayName", "description"] as const) {
    if (fields[name]) record[name] = fields[name];
    else delete record[name];
  }
  const checked = profile.$safeValidate(record);
  if (!checked.success) throw new WriteError("invalid", checked.reason.message);

  let stored: StoredRecord;
  try {
    // A first profile is created instead, which fails rather than overwrites
    // if one appeared meanwhile.
    stored = current
      ? await repo.putRecord(checked.value, "self", current.cid)
      : await repo.createRecord(checked.value, "self");
  } catch (err) {
    const failure = writeFailure(err);
    if (!current && failure instanceof XrpcResponseError) {
      // The create was refused: most likely a profile now exists.
      if (await repo.getRecord(profile.$type, "self")) throw conflict();
    }
    throw failure;
  }

  const expected = (await cidForLex(checked.value)).toString();
  if (expected !== stored.cid) {
    logError("[writes] stored CID differs from the written record's", null, {
      uri: stored.uri,
      stored: stored.cid,
      expected,
    });
  }
  // The version the PDS stored, which a later index read must show.
  return { uri: stored.uri, cid: stored.cid, ...profileFields(checked.value) };
}

// ---------------------------------------------------------------------------
// Full Profile & Organization record reads/patches (Profile Settings)
// ---------------------------------------------------------------------------

export type ProfileDetails = {
  cid: string | null;
  displayName: string;
  description: string;
  pronouns: string;
  website: string;
  langs: string[];
  avatarUrl: string | null;
  bannerUrl: string | null;
};

export type ProfilePatch = {
  displayName?: string;
  description?: string;
  pronouns?: string;
  website?: string;
  langs?: string[];
  /** Pass a TypedBlobRef to set a new uploaded image, `null` to delete, `undefined` to keep. */
  avatar?: TypedBlobRef | null;
  banner?: TypedBlobRef | null;
};

function readLangs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function toProfileDetails(
  did: string,
  cid: string | null,
  record: LexMap | undefined,
): ProfileDetails {
  return {
    cid,
    displayName: typeof record?.displayName === "string" ? record.displayName : "",
    description: typeof record?.description === "string" ? record.description : "",
    pronouns: typeof record?.pronouns === "string" ? record.pronouns : "",
    website: typeof record?.website === "string" ? record.website : "",
    langs: readLangs(record?.langs),
    avatarUrl: record?.avatar ? avatarUrl(did, record.avatar) : null,
    bannerUrl: record?.banner ? imageUrl(did, record.banner, "banner") : null,
  };
}

/** Reads the full `app.certified.actor.profile/self` record from `repo`'s PDS. */
export async function getProfileDetails(repo: Repository): Promise<ProfileDetails> {
  const current = await repo.getRecord(profile.$type, "self");
  return toProfileDetails(repo.did, current?.cid ?? null, current?.value);
}

/**
 * Patches selected fields on `app.certified.actor.profile/self`, keeping all
 * untouched fields intact and validating against the lexicon. Enforces
 * compare-and-swap via `expectedCid`.
 */
export async function patchProfile(
  repo: Repository,
  patch: ProfilePatch,
  expectedCid: string | null,
): Promise<ProfileDetails> {
  const current = await repo.getRecord(profile.$type, "self");
  if ((current?.cid ?? null) !== expectedCid) throw conflict();

  const record: LexMap = {
    ...current?.value,
    $type: profile.$type,
    createdAt: current?.value.createdAt ?? currentDatetimeString(),
  };

  for (const key of ["displayName", "description", "pronouns", "website"] as const) {
    if (patch[key] !== undefined) {
      const value = patch[key].trim();
      if (value) record[key] = value;
      else delete record[key];
    }
  }
  if (patch.langs !== undefined) {
    const cleaned = patch.langs.map((tag) => tag.trim()).filter(Boolean);
    if (cleaned.length > 0) record.langs = cleaned;
    else delete record.langs;
  }
  if (patch.avatar !== undefined) {
    if (patch.avatar === null) delete record.avatar;
    else record.avatar = { $type: smallImage.$type, image: patch.avatar };
  }
  if (patch.banner !== undefined) {
    if (patch.banner === null) delete record.banner;
    else record.banner = { $type: largeImage.$type, image: patch.banner };
  }

  const checked = profile.$safeValidate(record);
  if (!checked.success) throw new WriteError("invalid", checked.reason.message);

  let stored: StoredRecord;
  try {
    stored = current
      ? await repo.putRecord(checked.value, "self", current.cid)
      : await repo.createRecord(checked.value, "self");
  } catch (err) {
    const failure = writeFailure(err);
    if (!current && failure instanceof XrpcResponseError) {
      if (await repo.getRecord(profile.$type, "self")) throw conflict();
    }
    throw failure;
  }

  const expected = (await cidForLex(checked.value)).toString();
  if (expected !== stored.cid) {
    logError("[writes] stored CID differs from the written profile's", null, {
      uri: stored.uri,
      stored: stored.cid,
      expected,
    });
  }
  return toProfileDetails(repo.did, stored.cid, checked.value);
}

export type OrganizationUrlItem = { url: string; label: string };

export type OrganizationDetails = {
  exists: boolean;
  cid: string | null;
  legalName: string;
  logoUrl: string | null;
  publicEmail: string;
  organizationType: string[];
  /** ISO date `YYYY-MM-DD`, or empty string when unset. */
  foundedDate: string;
  urls: OrganizationUrlItem[];
  locationUri: string | null;
  longDescription: string;
  /** True when the record stores a Leaflet document or external ref rather than inline text. */
  longDescriptionReadOnly: boolean;
  visibility: "public" | "unlisted";
  langs: string[];
};

export type OrganizationPatch = {
  legalName?: string;
  logo?: TypedBlobRef | null;
  publicEmail?: string;
  organizationType?: string[];
  /** `YYYY-MM-DD` or empty string to clear. */
  foundedDate?: string;
  urls?: OrganizationUrlItem[];
  location?: StoredRecord | null;
  longDescription?: string;
  visibility?: "public" | "unlisted";
  langs?: string[];
};

function readOrganizationUrls(value: unknown): OrganizationUrlItem[] {
  if (!Array.isArray(value)) return [];
  const out: OrganizationUrlItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const url = (item as { url?: unknown }).url;
    const label = (item as { label?: unknown }).label;
    if (typeof url === "string" && url.trim()) {
      out.push({ url: url.trim(), label: typeof label === "string" ? label.trim() : "" });
    }
  }
  return out;
}

function readLongDescription(value: unknown): { text: string; readOnly: boolean } {
  if (!value) return { text: "", readOnly: false };
  if (typeof value === "string") return { text: value, readOnly: false };
  if (typeof value === "object") {
    const rec = value as { $type?: unknown; value?: unknown };
    if (rec.$type === descriptionString.$type && typeof rec.value === "string") {
      return { text: rec.value, readOnly: false };
    }
    return { text: "", readOnly: true };
  }
  return { text: "", readOnly: false };
}

function toOrganizationDetails(
  did: string,
  cid: string | null,
  record: LexMap | undefined,
): OrganizationDetails {
  const longDesc = readLongDescription(record?.longDescription);
  const rawFounded = typeof record?.foundedDate === "string" ? record.foundedDate : "";
  const foundedDate = /^\d{4}-\d{2}-\d{2}/.test(rawFounded) ? rawFounded.slice(0, 10) : "";
  const loc = record?.location as { uri?: unknown } | undefined;
  return {
    exists: cid !== null,
    cid,
    legalName: typeof record?.legalName === "string" ? record.legalName : "",
    logoUrl: record?.logo ? imageUrl(did, record.logo, "card") : null,
    publicEmail: typeof record?.publicEmail === "string" ? record.publicEmail : "",
    organizationType: readLangs(record?.organizationType),
    foundedDate,
    urls: readOrganizationUrls(record?.urls),
    locationUri: typeof loc?.uri === "string" ? loc.uri : null,
    longDescription: longDesc.text,
    longDescriptionReadOnly: longDesc.readOnly,
    visibility: record?.visibility === "unlisted" ? "unlisted" : "public",
    langs: readLangs(record?.langs),
  };
}

/** Reads `app.certified.actor.organization/self` from `repo`'s PDS. */
export async function getOrganizationDetails(repo: Repository): Promise<OrganizationDetails> {
  const current = await repo.getRecord(organization.$type, "self");
  return toOrganizationDetails(repo.did, current?.cid ?? null, current?.value);
}

/**
 * Patches selected fields on `app.certified.actor.organization/self`, keeping
 * untouched fields intact and validating against the lexicon.
 */
export async function patchOrganization(
  repo: Repository,
  patch: OrganizationPatch,
  expectedCid: string | null,
): Promise<OrganizationDetails> {
  const current = await repo.getRecord(organization.$type, "self");
  if ((current?.cid ?? null) !== expectedCid) throw conflict();

  const record: LexMap = {
    ...current?.value,
    $type: organization.$type,
    createdAt: current?.value.createdAt ?? currentDatetimeString(),
  };

  if (patch.legalName !== undefined) {
    const value = patch.legalName.trim();
    if (value) record.legalName = value;
    else delete record.legalName;
  }
  if (patch.publicEmail !== undefined) {
    const value = patch.publicEmail.trim();
    if (value) record.publicEmail = value;
    else delete record.publicEmail;
  }
  if (patch.logo !== undefined) {
    if (patch.logo === null) delete record.logo;
    else record.logo = { $type: smallImage.$type, image: patch.logo };
  }
  if (patch.organizationType !== undefined) {
    const cleaned = [...new Set(patch.organizationType.map((t) => t.trim()).filter(Boolean))];
    if (cleaned.length > 0) record.organizationType = cleaned;
    else delete record.organizationType;
  }
  if (patch.foundedDate !== undefined) {
    const value = patch.foundedDate.trim();
    if (value) record.foundedDate = `${value}T00:00:00.000Z`;
    else delete record.foundedDate;
  }
  if (patch.urls !== undefined) {
    const cleaned = patch.urls
      .map((item) => ({
        url: item.url.trim(),
        ...(item.label.trim() ? { label: item.label.trim() } : {}),
      }))
      .filter((item) => item.url.length > 0);
    if (cleaned.length > 0) record.urls = cleaned;
    else delete record.urls;
  }
  if (patch.location !== undefined) {
    if (patch.location === null) delete record.location;
    else record.location = { uri: patch.location.uri, cid: patch.location.cid };
  }
  if (patch.longDescription !== undefined) {
    const value = patch.longDescription.trim();
    if (value) record.longDescription = { $type: descriptionString.$type, value };
    else delete record.longDescription;
  }
  if (patch.visibility !== undefined) {
    record.visibility = patch.visibility;
  }
  if (patch.langs !== undefined) {
    const cleaned = patch.langs.map((tag) => tag.trim()).filter(Boolean);
    if (cleaned.length > 0) record.langs = cleaned;
    else delete record.langs;
  }

  const checked = organization.$safeValidate(record);
  if (!checked.success) throw new WriteError("invalid", checked.reason.message);

  let stored: StoredRecord;
  try {
    stored = current
      ? await repo.putRecord(checked.value, "self", current.cid)
      : await repo.createRecord(checked.value, "self");
  } catch (err) {
    const failure = writeFailure(err);
    if (!current && failure instanceof XrpcResponseError) {
      if (await repo.getRecord(organization.$type, "self")) throw conflict();
    }
    throw failure;
  }

  const expected = (await cidForLex(checked.value)).toString();
  if (expected !== stored.cid) {
    logError("[writes] stored CID differs from the written organization's", null, {
      uri: stored.uri,
      stored: stored.cid,
      expected,
    });
  }
  return toOrganizationDetails(repo.did, stored.cid, checked.value);
}

/** More badge definitions than an account plausibly keeps; guards against looping cursors. */
const MAX_DEFINITION_PAGES = 10;

/**
 * Finds the account's plain endorsement badge definition on its PDS: a valid
 * `app.certified.badge.definition` with `badgeType === "endorsement"`, title
 * `"Endorsement"`, and that allows `repo.did` to issue it. Reading the PDS
 * directly avoids creating a duplicate definition while the index catches up.
 * If several match, picks the oldest by `createdAt` so repeated calls agree.
 */
export async function findEndorsementDefinition(repo: Repository): Promise<string | null> {
  const matches: { uri: string; createdAt: string }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_DEFINITION_PAGES; page++) {
    const out = await repo.listRecords(badgeDefinition.$type, { limit: 100, cursor });
    for (const record of out.records) {
      const checked = badgeDefinition.$safeValidate(record.value);
      if (!checked.success) continue;
      const def = checked.value;
      if (def.badgeType !== ENDORSEMENT_BADGE_TYPE || def.title.trim() !== PLAIN_ENDORSEMENT) {
        continue;
      }
      if (def.allowedIssuers && !def.allowedIssuers.some((issuer) => issuer.did === repo.did)) {
        continue;
      }
      matches.push({ uri: record.uri, createdAt: def.createdAt });
    }
    if (!out.cursor || out.cursor === cursor) break;
    cursor = out.cursor;
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return matches[0].uri;
}

/**
 * Deletes a record from `repo`, treating an already-deleted record as a no-op
 * (including CGS returning 403 for a non-admin deleting an absent record).
 */
async function deleteRecordIdempotent(
  repo: Repository,
  collectionNsid: l.NsidString,
  rkey: string,
): Promise<void> {
  try {
    await repo.deleteRecord(collectionNsid, rkey);
  } catch (err) {
    if (err instanceof XrpcResponseError && err.error === "RecordNotFound") return;
    if (err instanceof XrpcResponseError && err.status === 403) {
      const stillThere = await repo.getRecord(collectionNsid, rkey).catch(() => ({
        cid: "",
        value: {},
      }));
      if (stillThere === null) return;
    }
    throw writeFailure(err);
  }
}

/**
 * Deletes a badge award (`app.certified.badge.award`) from `repo`, returning
 * the badge definition it awarded (null when it was already gone), whose
 * page lists it. A stopgap until the Hypercerts SDK supports deleting awards;
 * safe to repeat if the record is already gone.
 */
export async function deleteBadgeAward(repo: Repository, rkey: string): Promise<string | null> {
  const award = await repo.getRecord(badgeAward.$type, rkey).catch(() => null);
  await deleteRecordIdempotent(repo, badgeAward.$type, rkey);
  const badge = (award?.value as { badge?: { uri?: unknown } } | undefined)?.badge;
  return typeof badge?.uri === "string" ? badge.uri : null;
}

/**
 * Resolves a public record at `at://<did>/<collection>/<rkey>` to its current
 * strong reference `{ uri, cid }` by reading its owner's PDS through the OAuth
 * client's SSRF-safe resolver. Returns null when the record doesn't exist.
 */
export async function resolvePublicRecordRef(uri: string): Promise<StoredRecord | null> {
  const found = await resolvePublicRecord(uri);
  return found ? { uri: found.uri, cid: found.cid } : null;
}

/** Like resolvePublicRecordRef, with the record's value too. */
export async function resolvePublicRecord(
  uri: string,
): Promise<(StoredRecord & { value: unknown }) | null> {
  const parts = uri.slice("at://".length).split("/");
  if (parts.length !== 3) return null;
  const [did, collectionNsid, rkey] = parts;
  if (!did || !collectionNsid || !rkey) return null;
  try {
    const oauthClient = await getOAuthClient();
    const { didDoc } = await oauthClient.identityResolver.resolve(did);
    const pds = new Client({ service: extractPdsUrl(didDoc), fetch: oauthClient.fetch });
    const found = await getRecordFrom(
      pds,
      did as l.DidString,
      collectionNsid as l.NsidString,
      rkey,
    );
    return found ? { uri, cid: found.cid, value: found.value } : null;
  } catch (err) {
    logError("[writes] public record ref lookup failed", err, { uri });
    return null;
  }
}

/**
 * Resolves an account's profile record strong reference for `list:accounts`:
 * tries `app.certified.actor.profile/self`, falling back to
 * `app.bsky.actor.profile/self`.
 */
export async function resolveAccountProfileRef(did: l.DidString): Promise<StoredRecord | null> {
  const certified = await resolvePublicRecordRef(`at://${did}/app.certified.actor.profile/self`);
  if (certified) return certified;
  return resolvePublicRecordRef(`at://${did}/app.bsky.actor.profile/self`);
}

async function putCollectionRecord(
  repo: Repository,
  rkey: string,
  record: LexMap,
  swapRecord: string,
): Promise<StoredRecord> {
  const checked = collection.$safeValidate({ ...record, $type: collection.$type });
  if (!checked.success) throw new WriteError("invalid", checked.reason.message);
  try {
    const stored = await repo.putRecord(checked.value, rkey, swapRecord);
    const expected = (await cidForLex(checked.value)).toString();
    if (expected !== stored.cid) {
      logError("[writes] stored CID differs from the written collection's", null, {
        uri: stored.uri,
        stored: stored.cid,
        expected,
      });
    }
    return stored;
  } catch (err) {
    throw writeFailure(err);
  }
}

/** Updates a list's title and description, keeping its type, items, and other fields intact. */
export async function updateListDetails(
  repo: Repository,
  rkey: string,
  fields: { title: string; description: string },
): Promise<StoredRecord> {
  const current = await repo.getRecord(collection.$type, rkey);
  if (!current) throw new WriteError("invalid", "This list no longer exists.");

  const record: LexMap = { ...current.value, title: fields.title };
  if (fields.description) {
    record.description = { $type: descriptionString.$type, value: fields.description };
  } else {
    delete record.description;
    delete record.shortDescription;
  }
  return putCollectionRecord(repo, rkey, record, current.cid);
}

const MAX_LIST_ITEMS = 1000;

/** Appends deduplicated item strongRefs to a list, keeping existing items and weights intact. */
export async function addItemsToList(
  repo: Repository,
  rkey: string,
  refs: StoredRecord[],
): Promise<{ stored: StoredRecord; added: number; skipped: number }> {
  const current = await repo.getRecord(collection.$type, rkey);
  if (!current) throw new WriteError("invalid", "This list no longer exists.");
  const uri = `at://${repo.did}/${collection.$type}/${rkey}`;

  const existingItems = Array.isArray(current.value.items) ? current.value.items : [];
  const existingUris = new Set<string>();
  for (const item of existingItems) {
    const itemUri = (item as { itemIdentifier?: { uri?: unknown } })?.itemIdentifier?.uri;
    if (typeof itemUri === "string") existingUris.add(itemUri);
  }

  const toAdd: LexMap[] = [];
  let skipped = 0;
  for (const ref of refs) {
    if (existingUris.has(ref.uri)) {
      skipped++;
      continue;
    }
    existingUris.add(ref.uri);
    toAdd.push({ itemIdentifier: { uri: ref.uri, cid: ref.cid } });
  }

  if (toAdd.length === 0) {
    return { stored: { uri, cid: current.cid }, added: 0, skipped };
  }
  if (existingItems.length + toAdd.length > MAX_LIST_ITEMS) {
    throw new WriteError("invalid", `A list can hold at most ${MAX_LIST_ITEMS} items.`);
  }

  const record: LexMap = { ...current.value, items: [...existingItems, ...toAdd] };
  const stored = await putCollectionRecord(repo, rkey, record, current.cid);
  return { stored, added: toAdd.length, skipped };
}

/** Removes items matching `urisToRemove` from a list, keeping every other item intact. */
export async function removeItemsFromList(
  repo: Repository,
  rkey: string,
  urisToRemove: ReadonlySet<string>,
): Promise<{ stored: StoredRecord; removed: number }> {
  const current = await repo.getRecord(collection.$type, rkey);
  if (!current) throw new WriteError("invalid", "This list no longer exists.");
  const uri = `at://${repo.did}/${collection.$type}/${rkey}`;

  const existingItems = Array.isArray(current.value.items) ? current.value.items : [];
  const nextItems = existingItems.filter((item) => {
    const itemUri = (item as { itemIdentifier?: { uri?: unknown } })?.itemIdentifier?.uri;
    return typeof itemUri !== "string" || !urisToRemove.has(itemUri);
  });
  const removed = existingItems.length - nextItems.length;
  if (removed === 0) {
    return { stored: { uri, cid: current.cid }, removed: 0 };
  }

  const record: LexMap = { ...current.value };
  if (nextItems.length > 0) record.items = nextItems;
  else delete record.items;
  const stored = await putCollectionRecord(repo, rkey, record, current.cid);
  return { stored, removed };
}

/** Deletes a collection record (`org.hypercerts.collection`) from `repo`. */
export async function deleteCollectionRecord(repo: Repository, rkey: string): Promise<void> {
  return deleteRecordIdempotent(repo, collection.$type, rkey);
}
