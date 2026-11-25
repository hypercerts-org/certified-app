// Every write the app makes, the counterpart of ./queries for reads. Callers
// authenticate and pass a Repository and the app's record signer. When the
// Hypercerts SDK ships its write layer, only these bodies should change.
import "server-only";

import { extractPdsUrl } from "@atproto/did";
import {
  Client,
  currentDatetimeString,
  type LexMap,
  type l,
  XrpcError,
  XrpcResponseError,
} from "@atproto/lex";
import { cidForLex } from "@atproto/lex-cbor";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { app } from "@hypercerts-org/lexicon";
import { app as cgsLexicons } from "@hypercerts-org/certified-group-service";
import type { RecordSigner } from "@/lib/atproto/created-via";
import { getOAuthClient } from "@/lib/auth/oauth-client";
import { canEdit, cgs, cgsAuth } from "@/lib/cgs";
import { logError } from "@/lib/log";
import {
  ENDORSEMENT_BADGE_TYPE,
  PLAIN_ENDORSEMENT,
  type ProfileFields,
  type ProfileVersion,
  profileUri,
} from "./views";

const profile = app.certified.actor.profile;
const badgeDefinition = app.certified.badge.definition;
const badgeAward = app.certified.badge.award;

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
  /**
   * Replaces the record if it is still version `swapRecord`, where the
   * repository can check that (CGS can't yet: its putRecord has no swapRecord).
   */
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
    putRecord: async (record, rkey, swapRecord) =>
      (await client.putRecord(record, rkey, { swapRecord })).body,
    createRecord: async (record, rkey) => (await client.createRecord(record, rkey)).body,
    deleteRecord: async (collection, rkey, swapRecord) => {
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
    // No swapRecord (see Repository): the version is checked when the record
    // is read, just before the write.
    putRecord: async (record, rkey) =>
      cgs.call(
        putRecord,
        { repo: did, collection: record.$type, rkey, record },
        { headers: await cgsAuth(session, putRecord) },
      ),
    createRecord: async (record, rkey) =>
      cgs.call(
        createRecord,
        { repo: did, collection: record.$type, rkey, record },
        { headers: await cgsAuth(session, createRecord) },
      ),
    deleteRecord: async (collection, rkey, swapRecord) => {
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
 * as stored, and signs the result. `expectedCid` is the version the user
 * edited (null: no profile yet); if the profile changed since, this throws a
 * WriteError with reason "conflict" instead of overwriting.
 */
export async function updateProfile(
  repo: Repository,
  fields: ProfileFields,
  expectedCid: string | null,
  sign: RecordSigner,
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

  const signed = await sign(checked.value, { repositoryDid: repo.did });
  let stored: StoredRecord;
  try {
    // A first profile is created instead, which fails rather than overwrites
    // if one appeared meanwhile.
    stored = current
      ? await repo.putRecord(signed, "self", current.cid)
      : await repo.createRecord(signed, "self");
  } catch (err) {
    const failure = writeFailure(err);
    if (!current && failure instanceof XrpcResponseError) {
      // The create was refused: most likely a profile now exists.
      if (await repo.getRecord(profile.$type, "self")) throw conflict();
    }
    throw failure;
  }

  // The PDS stores exactly what was signed, so their CIDs match; if not, the
  // signature won't verify and the encoding assumption is broken.
  const expected = (await cidForLex(signed)).toString();
  if (expected !== stored.cid) {
    logError("[writes] stored CID differs from the signed record's", null, {
      uri: stored.uri,
      stored: stored.cid,
      signed: expected,
    });
  }
  // The version the PDS stored, which a later index read must show.
  return { uri: stored.uri, cid: stored.cid, ...profileFields(signed) };
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
 * Deletes a badge award (`app.certified.badge.award`) from `repo`. A stopgap
 * until the Hypercerts SDK supports deleting awards; safe to repeat if the
 * record is already gone.
 */
export async function deleteBadgeAward(repo: Repository, rkey: string): Promise<void> {
  try {
    await repo.deleteRecord(badgeAward.$type, rkey);
  } catch (err) {
    if (err instanceof XrpcResponseError && err.error === "RecordNotFound") return;
    throw writeFailure(err);
  }
}
