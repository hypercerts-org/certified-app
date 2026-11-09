"use server";

import { updateTag } from "next/cache";
import { getRecordSigner } from "@/lib/atproto/app-key";
import { getOAuthSession, getUser, SessionUnavailableError } from "@/lib/auth/dal";
import { canEdit } from "@/lib/cgs";
import { tags } from "@/lib/hypercerts/cache";
import type { ProfileFields, ProfileVersion } from "@/lib/hypercerts/views";
import { editableRepository, updateProfile, WriteError } from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";
import { isDid } from "@/lib/validate";

type SaveFailure = "signed-out" | "unavailable" | WriteError["reason"];

export type SaveProfileResult =
  | { ok: true; saved: ProfileVersion }
  | {
      ok: false;
      /**
       * Nothing was written, except perhaps for "unknown": the write was sent
       * but its answer was lost, so only reading the profile can tell.
       */
      reason: SaveFailure;
      message: string;
    };

const MESSAGES: Record<SaveFailure, string> = {
  "signed-out": "Sign in again to save this profile.",
  forbidden:
    "You can't edit this profile. Only the account itself and an organization's admins and owners can.",
  conflict: "The profile was changed somewhere else. Reload to see the latest version.",
  invalid: "The profile could not be saved as entered.",
  unknown: "We couldn't confirm whether the profile was saved. Reload to check.",
  unavailable: "The profile could not be saved right now. Please try again.",
};

const failure = (reason: SaveFailure, message = MESSAGES[reason]): SaveProfileResult => ({
  ok: false,
  reason,
  message,
});

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
    return failure("invalid");
  }

  try {
    const session = await getOAuthSession();
    if (!session) return failure("signed-out");
    const repository = await editableRepository(session, repo);
    if (!repository) return failure("forbidden");
    const saved = await updateProfile(
      repository,
      { displayName: displayName.trim(), description: description.trim() },
      expectedCid,
      await getRecordSigner(),
    );
    return { ok: true, saved };
  } catch (err) {
    if (err instanceof WriteError) {
      return err.reason === "invalid" ? failure("invalid", err.message) : failure(err.reason);
    }
    if (!(err instanceof SessionUnavailableError)) logError("[profile] save failed", err);
    return failure("unavailable");
  }
}

/**
 * The index has caught up with a save of profile `did`: expire the account's
 * cached public pages, so the next request renders fresh. Only someone who
 * may edit the profile may ask.
 */
export async function profileIndexed(did: string): Promise<void> {
  if (typeof did !== "string" || !isDid(did)) return;
  try {
    const user = await getUser();
    if (!user) return;
    if (user.did !== did) {
      const session = await getOAuthSession();
      if (!session || !(await canEdit(session, did))) return;
    }
    updateTag(tags.actor(did));
  } catch (err) {
    // Errors can carry upstream requests and tokens: only logError strips them.
    if (!(err instanceof SessionUnavailableError)) logError("[profile] cache refresh failed", err);
  }
}
