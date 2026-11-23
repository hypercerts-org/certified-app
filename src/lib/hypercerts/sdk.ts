// The Hypercerts SDK, for the writes it covers (follows, activities). It takes
// the signed-in session as is; organizations' writes go through CGS.
import "server-only";

import { Client, type l } from "@atproto/lex";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { createSDKContext, type SDKContext, type WriteOptions } from "@hypercerts-org/sdk";
import {
  PartialWriteError,
  WriteOutcomeUnknownError,
  WriteRejectedError,
} from "@hypercerts-org/sdk/social";
import { SessionUnavailableError } from "@/lib/auth/dal";
import { CGS_DID, CGS_URL } from "@/lib/cgs";
import { logError } from "@/lib/log";

export function sdkContext(session: OAuthSession): SDKContext {
  return createSDKContext({
    client: new Client(session),
    cgs: { url: CGS_URL.href, did: CGS_DID as l.DidString },
  });
}

/** Where a write as `actor` goes: the user's own repository, or (through CGS) an organization's. */
export function writeTo(session: OAuthSession, actor: string): WriteOptions | undefined {
  return actor === session.did ? undefined : { repo: actor as l.DidString };
}

/**
 * Why an SDK write failed. "unknown": it was sent but no answer came back, or
 * only some of its records were written (organizations' writes go one record
 * at a time); reading is the only way to tell. Every other reason means
 * nothing was written.
 */
export type WriteFailure = "forbidden" | "invalid" | "unknown" | "unavailable";

/** Sorts a failed SDK write; logs what isn't the user's to fix. */
export function writeFailure(err: unknown, what: string): WriteFailure {
  if (err instanceof WriteOutcomeUnknownError || err instanceof PartialWriteError) return "unknown";
  if (err instanceof WriteRejectedError) {
    return err.status === 401 || err.status === 403 ? "forbidden" : "invalid";
  }
  if (err instanceof TypeError) return "invalid";
  // Errors can carry upstream requests and tokens: only logError strips them.
  if (!(err instanceof SessionUnavailableError)) logError(`[write] ${what} failed`, err);
  return "unavailable";
}
