"use server";

// Follow and unfollow, as the account the user acts as (their own, or an
// organization through CGS), written with the Hypercerts SDK. Each waits for
// the index to show the change, then expires the cached pages it changes, so
// the page the action returns with (and every page after) shows it.

import {
  followAccount,
  unfollowAccount,
  WriteOutcomeUnknownError,
  WriteRejectedError,
} from "@hypercerts-org/sdk/social";
import { updateTag } from "next/cache";
import { getActingAs } from "@/lib/acting-as";
import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { getIndexedFollow } from "@/lib/hypercerts/queries";
import { sdkContext, writeTo } from "@/lib/hypercerts/sdk";
import type { FollowRef } from "@/lib/hypercerts/views";
import { logError } from "@/lib/log";
import { isDid } from "@/lib/validate";

type FollowFailure = "signed-out" | "forbidden" | "invalid" | "unknown" | "unavailable";
type Action = "follow" | "unfollow";

export type FollowFailed = { ok: false; reason: FollowFailure; message: string };
/**
 * `follow`: the follow record after the action (null after an unfollow).
 * `indexed`: the index showed the change before the action gave up waiting.
 */
export type FollowResult = { ok: true; follow: FollowRef; indexed: boolean } | FollowFailed;
export type UnfollowResult = { ok: true; follow: null; indexed: boolean } | FollowFailed;

/**
 * What went wrong, for the toast. `asOrganization`: the write went through
 * CGS, where any member may follow, but only admins and owners may delete a
 * record another member made.
 */
function message(reason: FollowFailure, action: Action, asOrganization: boolean): string {
  switch (reason) {
    case "signed-out":
      return action === "follow"
        ? "Your session has ended. Sign in again to follow accounts."
        : "Your session has ended. Sign in again to unfollow accounts.";
    case "forbidden":
      if (!asOrganization) {
        return "Your sign-in doesn't allow this. Sign out and sign in again.";
      }
      return action === "follow"
        ? "The organization refused the follow. Check that you're still a member."
        : "Only the organization's admins and owners can undo a follow another member made.";
    case "invalid":
      return action === "follow"
        ? "This account can't be followed."
        : "This follow couldn't be undone.";
    case "unknown":
      return action === "follow"
        ? "We couldn't confirm the follow. Reload to check."
        : "We couldn't confirm the unfollow. Reload to check.";
    case "unavailable":
      return action === "follow"
        ? "The follow didn't go through. Please try again."
        : "The unfollow didn't go through. Please try again.";
  }
}

const failure = (reason: FollowFailure, action: Action, asOrganization = false): FollowFailed => ({
  ok: false,
  reason,
  message: message(reason, action, asOrganization),
});

function failed(err: unknown, action: Action, asOrganization: boolean): FollowFailed {
  const fail = (reason: FollowFailure) => failure(reason, action, asOrganization);
  if (err instanceof WriteOutcomeUnknownError) return fail("unknown");
  if (err instanceof WriteRejectedError) {
    return fail(err.status === 401 || err.status === 403 ? "forbidden" : "invalid");
  }
  if (err instanceof TypeError) return fail("invalid");
  // Errors can carry upstream requests and tokens: only logError strips them.
  if (!(err instanceof SessionUnavailableError)) logError(`[follow] ${action} failed`, err);
  return fail("unavailable");
}

/** The session, and the account it acts as, when that may follow `subject`. */
async function writer(subject: unknown, action: Action) {
  if (typeof subject !== "string" || !isDid(subject)) return failure("invalid", action);
  const [session, actor] = await Promise.all([getOAuthSession(), getActingAs()]);
  if (!session || !actor) return failure("signed-out", action);
  if (actor === subject) return failure("invalid", action);
  return { session, actor, subject, asOrganization: actor !== session.did };
}

/**
 * Expires what a follow between the two accounts changes: their follows
 * (counts, lists, the Follow button) and their profiles' feeds.
 */
function expireFollows(actor: string, subject: string) {
  for (const did of [actor, subject]) {
    updateTag(tags.follows(did));
    updateTag(tags.actor(did));
  }
}

/**
 * Follows account `subject`. When the index already shows a follow (made in
 * another tab, say), returns that one rather than writing a duplicate.
 */
export async function follow(subject: string): Promise<FollowResult> {
  let asOrganization = false;
  try {
    const w = await writer(subject, "follow");
    if ("ok" in w) return w;
    asOrganization = w.asOrganization;
    const existing = await getIndexedFollow(w.actor, w.subject).catch(() => null);
    if (existing) return { ok: true, follow: existing, indexed: true };
    const made = await followAccount(
      sdkContext(w.session),
      { subject: { did: w.subject } },
      writeTo(w.session, w.actor),
    );
    const indexed = await waitForIndex(
      async () => (await getIndexedFollow(w.actor, w.subject)) !== null,
    );
    expireFollows(w.actor, w.subject);
    return { ok: true, follow: { uri: made.uri, cid: made.cid }, indexed };
  } catch (err) {
    return failed(err, "follow", asOrganization);
  }
}

/**
 * Unfollows account `subject`: deletes the follow records the browser knows
 * of (`uris`: one the index didn't show yet) and the one the index shows.
 * Safe to repeat.
 */
export async function unfollow(input: {
  subject: string;
  uris: string[];
}): Promise<UnfollowResult> {
  let asOrganization = false;
  try {
    const w = await writer(input?.subject, "unfollow");
    if ("ok" in w) return w;
    asOrganization = w.asOrganization;
    const known = Array.isArray(input.uris) ? input.uris : [];
    if (known.length > 5 || known.some((uri) => typeof uri !== "string")) {
      return failure("invalid", "unfollow");
    }
    const shown = await getIndexedFollow(w.actor, w.subject).catch(() => null);
    const removed = [...new Set([...known, ...(shown ? [shown.uri] : [])])];
    const context = sdkContext(w.session);
    // One at a time: each is its own write, and a failure stops the rest.
    for (const uri of removed) {
      await unfollowAccount(context, { follow: { uri } }, writeTo(w.session, w.actor));
    }
    // Done once the index shows none of them (a follow made since, elsewhere, may remain).
    const indexed = await waitForIndex(async () => {
      const follow = await getIndexedFollow(w.actor, w.subject);
      return follow === null || !removed.includes(follow.uri);
    });
    expireFollows(w.actor, w.subject);
    return { ok: true, follow: null, indexed };
  } catch (err) {
    return failed(err, "unfollow", asOrganization);
  }
}
