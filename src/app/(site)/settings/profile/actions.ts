"use server";

import { getRecordSigner } from "@/lib/atproto/app-key";
import { updateTag } from "next/cache";
import { getOAuthSession, getUser, SessionUnavailableError } from "@/lib/auth/dal";
import { tags } from "@/lib/hypercerts/cache";
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";
import {
  InvalidRecordError,
  updateOwnProfile,
  WriteConflictError,
  WriteOutcomeUnknownError,
} from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";

export type SaveProfileResult =
  | { ok: true; saved: ProfileVersion }
  | {
      ok: false;
      /**
       * Nothing was written, except perhaps for "unknown": the write was sent
       * but its answer was lost, so only reading the profile can tell.
       */
      reason: "signed-out" | "conflict" | "invalid" | "unavailable" | "unknown";
      message: string;
    };

/**
 * Saves the signed-in user's display name and description to their own
 * profile, signed by the app. `expectedCid` is the version the user was
 * editing (null: they had no profile); a newer version is never overwritten.
 * The arguments come from the browser, so they are checked here again.
 */
export async function saveProfile(input: {
  fields: ProfileFields;
  expectedCid: string | null;
}): Promise<SaveProfileResult> {
  // The lexicon's byte limits, as a cheap bound before calling the PDS; the
  // record is validated exactly before it is signed.
  const { displayName, description } = input?.fields ?? {};
  const expectedCid = input?.expectedCid;
  if (
    typeof displayName !== "string" ||
    typeof description !== "string" ||
    displayName.length > 640 ||
    description.length > 2560 ||
    (expectedCid !== null && typeof expectedCid !== "string")
  ) {
    return { ok: false, reason: "invalid", message: "The profile could not be read." };
  }

  try {
    const session = await getOAuthSession();
    if (!session) {
      return { ok: false, reason: "signed-out", message: "Sign in again to save your profile." };
    }
    const saved = await updateOwnProfile(
      session,
      { displayName: displayName.trim(), description: description.trim() },
      expectedCid,
      await getRecordSigner(),
    );
    return { ok: true, saved };
  } catch (err) {
    if (err instanceof WriteConflictError) {
      return {
        ok: false,
        reason: "conflict",
        message: "Your profile was changed somewhere else. Reload to see the latest version.",
      };
    }
    if (err instanceof WriteOutcomeUnknownError) {
      return {
        ok: false,
        reason: "unknown",
        message: "We couldn't confirm whether your profile was saved. Reload to check.",
      };
    }
    if (err instanceof InvalidRecordError) {
      return { ok: false, reason: "invalid", message: err.message };
    }
    if (!(err instanceof SessionUnavailableError)) logError("[profile] save failed", err);
    return {
      ok: false,
      reason: "unavailable",
      message: "Your profile could not be saved right now. Please try again.",
    };
  }
}

/**
 * The index has caught up with the user's save: expire the account's cached
 * public pages, so the next request renders fresh. Only the account may ask.
 */
export async function profileIndexed(did: string): Promise<void> {
  if ((await getUser())?.did === did) updateTag(tags.actor(did));
}
