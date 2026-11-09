// Every write the app makes, the counterpart of ./queries for reads. Callers
// authenticate and pass a Repository and the app's record signer. When the
// Hypercerts SDK ships its write layer, only these bodies should change.
import "server-only";

import { extractPdsUrl } from "@atproto/did";
import {
  Client,
  currentDatetimeString,
  type l,
  type LexMap,
  XrpcResponseError,
} from "@atproto/lex";
import { cidForLex } from "@atproto/lex-cbor";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { app } from "@hypercerts-org/lexicon";
import type { RecordSigner } from "@/lib/atproto/created-via";
import { getOAuthClient } from "@/lib/auth/oauth-client";
import { CgsAuthError, canManage, cgs, cgsAuth } from "@/lib/cgs";
import { app as cgsLexicons } from "@/lexicons";
import { logError } from "@/lib/log";
import type { ProfileFields, ProfileVersion } from "./views";

const profile = app.certified.actor.profile;

/** The record changed since the caller read it (compare-and-swap failed). */
export class WriteConflictError extends Error {
  constructor() {
    super("The record changed since it was read");
    this.name = "WriteConflictError";
  }
}

/** The repository refused the caller's role (CGS answered 403). */
export class WriteForbiddenError extends Error {
  constructor() {
    super("Not allowed to write this record");
    this.name = "WriteForbiddenError";
  }
}

/**
 * The write was sent but no answer came back (timeout, dropped connection):
 * it may or may not have been stored. Never retry blindly; read the record to
 * find out.
 */
export class WriteOutcomeUnknownError extends Error {
  constructor() {
    super("The write's outcome is unknown");
    this.name = "WriteOutcomeUnknownError";
  }
}

/** The record would not match its lexicon. `message` is safe to show. */
export class InvalidRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRecordError";
  }
}

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
  /** Replaces the record if it is still version `swapRecord`. */
  putRecord(record: TypedRecord, rkey: string, swapRecord: string): Promise<StoredRecord>;
  /** Creates the record; fails if one exists. */
  createRecord(record: TypedRecord, rkey: string): Promise<StoredRecord>;
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

/** The session user's own repository, on their PDS. */
export function ownRepository(session: OAuthSession): Repository {
  const client = new Client(session);
  return {
    did: session.did,
    getRecord: (collection, rkey) => getRecordFrom(client, session.did, collection, rkey),
    putRecord: async (record, rkey, swapRecord) =>
      (await client.putRecord(record, rkey, { swapRecord })).body,
    createRecord: async (record, rkey) => (await client.createRecord(record, rkey)).body,
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
  const { createRecord, putRecord } = cgsLexicons.certified.group.repo;
  return {
    did,
    getRecord: (collection, rkey) => getRecordFrom(pds, did, collection, rkey),
    // CGS's putRecord has no swapRecord, so for organizations the check that
    // the record is unchanged happens when it is read, just before the write.
    putRecord: async (record, rkey) =>
      cgs.call(
        putRecord,
        { repo: did, collection: record.$type, rkey, record },
        { headers: await cgsAuth(session, putRecord.$lxm) },
      ),
    createRecord: async (record, rkey) =>
      cgs.call(
        createRecord,
        { repo: did, collection: record.$type, rkey, record },
        { headers: await cgsAuth(session, createRecord.$lxm) },
      ),
  };
}

/**
 * The repository `did` as the session's user may edit it: their own, or an
 * organization they manage on CGS. Null when they may not.
 */
export async function editableRepository(
  session: OAuthSession,
  did: l.DidString,
): Promise<Repository | null> {
  if (did === session.did) return ownRepository(session);
  return (await canManage(session, did)) ? organizationRepository(session, did) : null;
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

const profileUri = (did: string) => `at://${did}/${profile.$type}/self`;

/**
 * A failed write's meaning. Only a 4xx answer proves nothing was stored; a
 * 5xx (from the PDS, CGS or a proxy in front of them) or no answer at all
 * leaves the outcome unknown. A service-auth token that couldn't be minted
 * means the write was never sent.
 */
function writeFailure(err: unknown): Error {
  if (err instanceof CgsAuthError) return err;
  if (err instanceof XrpcResponseError && err.status < 500) {
    if (err.error === "InvalidSwap") return new WriteConflictError();
    if (err.status === 403) return new WriteForbiddenError();
    return err;
  }
  return new WriteOutcomeUnknownError();
}

/**
 * Sets the profile's display name and description, keeping every other field
 * as stored, and signs the result. `expectedCid` is the version the user
 * edited (null: no profile yet); if the profile changed since, this throws
 * WriteConflictError instead of overwriting.
 */
export async function updateProfile(
  repo: Repository,
  fields: ProfileFields,
  expectedCid: string | null,
  sign: RecordSigner,
): Promise<ProfileVersion> {
  const current = await repo.getRecord(profile.$type, "self");
  if ((current?.cid ?? null) !== expectedCid) throw new WriteConflictError();

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
  if (!checked.success) throw new InvalidRecordError(checked.reason.message);

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
      if (await repo.getRecord(profile.$type, "self")) throw new WriteConflictError();
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
