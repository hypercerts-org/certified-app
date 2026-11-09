"use server";

import { getRecordSigner } from "@/lib/atproto/app-key";
import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
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
       * Nothing was written, except for "unknown": the write was sent but its
       * answer was lost, so the caller must read the profile to find out.
       */
      reason: "signed-out" | "conflict" | "invalid" | "unavailable" | "unknown";
      message: string;
    };

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value.trim() : null;
}

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
  // Generous byte bounds; the lexicon's grapheme limits are checked on the
  // record before it is signed.
  const displayName = text(input?.fields?.displayName, 640);
  const description = text(input?.fields?.description, 2560);
  const expectedCid = input?.expectedCid === null ? null : text(input?.expectedCid, 128);
  const badCid = input?.expectedCid !== null && expectedCid === null;
  if (displayName === null || description === null || badCid) {
    return { ok: false, reason: "invalid", message: "The profile could not be read." };
  }

  try {
    const session = await getOAuthSession();
    if (!session) {
      return { ok: false, reason: "signed-out", message: "Sign in again to save your profile." };
    }
    const saved = await updateOwnProfile(
      session,
      { displayName, description },
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
      return { ok: false, reason: "unknown", message: "Checking whether your profile was saved…" };
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
