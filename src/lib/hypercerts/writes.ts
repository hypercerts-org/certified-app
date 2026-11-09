// Writes to the signed-in user's repository.
//
// Every write the app makes goes through these functions, the counterpart of
// ./queries for reads. They take the caller's authenticated agent (an OAuth
// session) and the app's record signer; callers authenticate and authorize.
// When the Hypercerts SDK ships its write layer, only the bodies of these
// functions should change.
import "server-only";

import { type Agent, Client, type LexMap, XrpcResponseError } from "@atproto/lex";
import { app } from "@hypercerts-org/lexicon";
import type { RecordSigner } from "@/lib/atproto/created-via";
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
    return { cid: body.cid ?? null, value: body.value };
  } catch (err) {
    if (err instanceof XrpcResponseError && err.error === "RecordNotFound") {
      return { cid: null, value: undefined };
    }
    throw err;
  }
}

/**
 * Sets the profile's display name and description, keeping every other field
 * (images, links, other apps' fields) as stored, and signs the result.
 * `expectedCid` is the version the user edited (null: no profile yet); if the
 * profile changed since, this throws WriteConflictError instead of overwriting.
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
    createdAt: current.value?.createdAt ?? new Date().toISOString(),
  };
  for (const name of ["displayName", "description"] as const) {
    if (fields[name]) record[name] = fields[name];
    else delete record[name];
  }
  const checked = profile.$safeValidate(record);
  if (!checked.success) throw new InvalidRecordError(checked.reason.message);

  const signed = await sign(checked.value, { repositoryDid: agent.did });
  try {
    const { body } = await new Client(agent).putRecord(signed, "self", {
      // A first profile can't be compared against a previous version.
      ...(current.cid ? { swapRecord: current.cid } : {}),
    });
    // The version the PDS stored, which a later index read must show.
    return { uri: body.uri, cid: body.cid, ...profileFields(signed) };
  } catch (err) {
    if (err instanceof XrpcResponseError) {
      // The PDS answered, so nothing was stored.
      if (err.error === "InvalidSwap") throw new WriteConflictError();
      throw err;
    }
    throw new WriteOutcomeUnknownError();
  }
}
