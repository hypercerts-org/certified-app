// Every write the app makes, the counterpart of ./queries for reads. Callers
// authenticate and pass an OAuth session and the app's record signer. When the
// Hypercerts SDK ships its write layer, only these bodies should change.
import "server-only";

import {
  type Agent,
  Client,
  currentDatetimeString,
  type LexMap,
  XrpcResponseError,
} from "@atproto/lex";
import { cidForLex } from "@atproto/lex-cbor";
import { app } from "@hypercerts-org/lexicon";
import type { RecordSigner } from "@/lib/atproto/created-via";
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

/** The profile fields this app edits, as they appear on a record. */
export function profileFields(record: LexMap | undefined): ProfileFields {
  return {
    displayName: typeof record?.displayName === "string" ? record.displayName : "",
    description: typeof record?.description === "string" ? record.description : "",
  };
}

/**
 * The user's own profile record straight from their PDS, the authoritative
 * copy (the API's index may lag behind it). `cid` is null when there is none.
 */
export async function getOwnProfile(agent: Agent): Promise<{
  cid: string | null;
  value: LexMap | undefined;
}> {
  try {
    const { body } = await new Client(agent).getRecord(profile.$type, "self");
    // Without the version there is nothing to compare-and-swap against.
    if (!body.cid) throw new Error("The PDS returned the profile without its CID");
    return { cid: body.cid, value: body.value };
  } catch (err) {
    if (err instanceof XrpcResponseError && err.error === "RecordNotFound") {
      return { cid: null, value: undefined };
    }
    throw err;
  }
}

/**
 * A failed write's meaning. Only a 4xx answer proves the PDS stored nothing; a
 * 5xx (from the PDS or a proxy in front of it) or no answer at all leaves the
 * outcome unknown.
 */
function writeFailure(err: unknown): Error {
  if (err instanceof XrpcResponseError && err.status < 500) {
    return err.error === "InvalidSwap" ? new WriteConflictError() : err;
  }
  return new WriteOutcomeUnknownError();
}

/**
 * Sets the profile's display name and description, keeping every other field
 * as stored, and signs the result. `expectedCid` is the version the user
 * edited (null: no profile yet); if the profile changed since, this throws
 * WriteConflictError instead of overwriting.
 */
export async function updateOwnProfile(
  agent: Agent & { did: string },
  fields: ProfileFields,
  expectedCid: string | null,
  sign: RecordSigner,
): Promise<ProfileVersion> {
  const current = await getOwnProfile(agent);
  if (current.cid !== expectedCid) throw new WriteConflictError();

  const record: LexMap = {
    ...current.value,
    $type: profile.$type,
    createdAt: current.value?.createdAt ?? currentDatetimeString(),
  };
  for (const name of ["displayName", "description"] as const) {
    if (fields[name]) record[name] = fields[name];
    else delete record[name];
  }
  const checked = profile.$safeValidate(record);
  if (!checked.success) throw new InvalidRecordError(checked.reason.message);

  const signed = await sign(checked.value, { repositoryDid: agent.did });
  const client = new Client(agent);
  let stored: { uri: string; cid: string };
  try {
    // Compare-and-swap on the version read. A first profile is created
    // instead, which fails rather than overwrites if one appeared meanwhile.
    stored = current.cid
      ? (await client.putRecord(signed, "self", { swapRecord: current.cid })).body
      : (await client.createRecord(signed, "self")).body;
  } catch (err) {
    const failure = writeFailure(err);
    if (!current.cid && !(failure instanceof WriteOutcomeUnknownError)) {
      // The create was refused: most likely a profile now exists.
      if ((await getOwnProfile(agent)).cid) throw new WriteConflictError();
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
