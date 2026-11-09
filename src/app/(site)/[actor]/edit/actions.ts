"use server";

import { getRecordSigner } from "@/lib/atproto/app-key";
import { updateTag } from "next/cache";
import { getOAuthSession, getUser, SessionUnavailableError } from "@/lib/auth/dal";
import { canManage } from "@/lib/cgs";
import { tags } from "@/lib/hypercerts/cache";
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";
import {
  editableRepository,
  InvalidRecordError,
  updateProfile,
  WriteConflictError,
  WriteForbiddenError,
  WriteOutcomeUnknownError,
} from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";
import { isDid } from "@/lib/validate";

export type SaveProfileResult =
  | { ok: true; saved: ProfileVersion }
  | {
      ok: false;
      /**
       * Nothing was written, except perhaps for "unknown": the write was sent
       * but its answer was lost, so only reading the profile can tell.
       */
      reason: "signed-out" | "forbidden" | "conflict" | "invalid" | "unavailable" | "unknown";
      message: string;
    };

const FORBIDDEN: SaveProfileResult = {
  ok: false,
  reason: "forbidden",
  message: "You can't edit this profile. Only its own account and an organization's admins can.",
};

/**
 * Saves the display name and description of profile `repo`: the signed-in
 * user's own, or an organization's they manage, signed by the app.
 * `expectedCid` is the version the user was editing (null: there was no
 * profile); a newer version is never overwritten. The arguments come from
 * the browser, so they are checked here again.
 */
export async function saveProfile(input: {
  repo: string;
  fields: ProfileFields;
  expectedCid: string | null;
}): Promise<SaveProfileResult> {
  // The lexicon's byte limits, as a cheap bound before calling the PDS; the
  // record is validated exactly before it is signed.
  const { displayName, description } = input?.fields ?? {};
  const { repo, expectedCid } = input ?? {};
  if (
    typeof repo !== "string" ||
    !isDid(repo) ||
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
    const repository = await editableRepository(session, repo);
    if (!repository) return FORBIDDEN;
    const saved = await updateProfile(
      repository,
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
        message: "The profile was changed somewhere else. Reload to see the latest version.",
      };
    }
    if (err instanceof WriteForbiddenError) return FORBIDDEN;
    if (err instanceof WriteOutcomeUnknownError) {
      return {
        ok: false,
        reason: "unknown",
        message: "We couldn't confirm whether the profile was saved. Reload to check.",
      };
    }
    if (err instanceof InvalidRecordError) {
      return { ok: false, reason: "invalid", message: err.message };
    }
    if (!(err instanceof SessionUnavailableError)) logError("[profile] save failed", err);
    return {
      ok: false,
      reason: "unavailable",
      message: "The profile could not be saved right now. Please try again.",
    };
  }
}

/**
 * The index has caught up with a save of profile `did`: expire the account's
 * cached public pages, so the next request renders fresh. Only someone who
 * may edit the profile may ask.
 */
export async function profileIndexed(did: string): Promise<void> {
  if (typeof did !== "string" || !isDid(did)) return;
  const user = await getUser();
  if (!user) return;
  if (user.did !== did) {
    const session = await getOAuthSession();
    if (!session || !(await canManage(session, did))) return;
  }
  updateTag(tags.actor(did));
}
