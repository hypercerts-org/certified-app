"use server";

// Like and unlike any AT Protocol record (activity, project, update,
// evaluation, measurement, attachment) as the account the user acts as
// (personal repo or organization via CGS), written with @hypercerts-org/sdk/social.

import { like, unlike } from "@hypercerts-org/sdk/social";
import { updateTag } from "next/cache";
import { getOAuthSession } from "@/lib/auth/dal";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { mayPublish } from "@/lib/hypercerts/publish-access";
import { getIndexedActorLike } from "@/lib/hypercerts/queries";
import { sdkContext, type WriteFailure, writeFailure, writeTo } from "@/lib/hypercerts/sdk";
import { logError } from "@/lib/log";
import { isAtUri, isDid } from "@/lib/validate";

type LikeFailure = WriteFailure | "signed-out";
export type LikeFailed = { ok: false; reason: LikeFailure; message: string };
export type LikeResult = { ok: true; likeUri: string; indexed: boolean } | LikeFailed;
export type UnlikeResult = { ok: true; likeUri: null; indexed: boolean } | LikeFailed;

function messageFor(reason: LikeFailure, action: "like" | "unlike", asOrg: boolean): string {
  switch (reason) {
    case "signed-out":
      return `Your session has ended. Sign in again to ${action} records.`;
    case "forbidden":
      if (!asOrg) return "Your sign-in doesn't allow this. Sign out and sign in again.";
      return action === "like"
        ? "The group refused the like. Check that you're still a member."
        : "Only the group's admins and owners can undo a like another member made.";
    case "invalid":
      return action === "like"
        ? "This record can't be liked right now."
        : "This like couldn't be removed.";
    case "unknown":
      return action === "like"
        ? "We couldn't confirm the like. Reload to check."
        : "We couldn't confirm removing the like. Reload to check.";
    case "unavailable":
      return action === "like"
        ? "The like didn't go through. Please try again."
        : "Removing the like didn't go through. Please try again.";
  }
}

function fail(reason: LikeFailure, action: "like" | "unlike", asOrg = false): LikeFailed {
  return { ok: false, reason, message: messageFor(reason, action, asOrg) };
}

/** Likes record `subject` (AT-URI) as `repo` (DID). Deduplicates against the index. */
export async function likeRecord(input: { repo: string; subject: string }): Promise<LikeResult> {
  if (
    typeof input?.repo !== "string" ||
    !isDid(input.repo) ||
    typeof input?.subject !== "string" ||
    !isAtUri(input.subject)
  ) {
    return fail("invalid", "like");
  }
  const { repo, subject } = input;
  let asOrg = false;
  try {
    const session = await getOAuthSession();
    if (!session) return fail("signed-out", "like");
    asOrg = repo !== session.did;
    if (!(await mayPublish(session, repo))) return fail("forbidden", "like", asOrg);

    const existing = await getIndexedActorLike(repo, subject).catch((err) => {
      logError("[like] index check failed", err, { repo, subject });
      return null;
    });
    if (existing) return { ok: true, likeUri: existing.uri, indexed: true };

    const made = await like(
      await sdkContext(session),
      { subject: { uri: subject } },
      writeTo(session, repo),
    );
    const indexed = await waitForIndex(
      async () => (await getIndexedActorLike(repo, subject)) !== null,
    );
    updateTag(tags.likes(subject));
    updateTag(tags.actorLikes(repo));
    return { ok: true, likeUri: made.uri, indexed };
  } catch (err) {
    return fail(writeFailure(err, "like"), "like", asOrg);
  }
}

/** Removes likes for `subject` as `repo` (both known optimistic URIs and indexed like). */
export async function unlikeRecord(input: {
  repo: string;
  subject: string;
  uris: string[];
}): Promise<UnlikeResult> {
  if (
    typeof input?.repo !== "string" ||
    !isDid(input.repo) ||
    typeof input?.subject !== "string" ||
    !isAtUri(input.subject)
  ) {
    return fail("invalid", "unlike");
  }
  const { repo, subject } = input;
  const known = Array.isArray(input.uris) ? input.uris : [];
  if (known.length > 5 || known.some((uri) => typeof uri !== "string" || !isAtUri(uri))) {
    return fail("invalid", "unlike");
  }

  let asOrg = false;
  try {
    const session = await getOAuthSession();
    if (!session) return fail("signed-out", "unlike");
    asOrg = repo !== session.did;
    if (!(await mayPublish(session, repo))) return fail("forbidden", "unlike", asOrg);

    const shown = await getIndexedActorLike(repo, subject).catch((err) => {
      logError("[unlike] index check failed", err, { repo, subject });
      return null;
    });
    const toRemove = [...new Set([...known, ...(shown ? [shown.uri] : [])])];
    const context = await sdkContext(session);
    const target = writeTo(session, repo);
    for (const uri of toRemove) {
      await unlike(context, { like: { uri } }, target);
    }

    const indexed = await waitForIndex(async () => {
      const left = await getIndexedActorLike(repo, subject);
      return left === null || !toRemove.includes(left.uri);
    });
    updateTag(tags.likes(subject));
    updateTag(tags.actorLikes(repo));
    return { ok: true, likeUri: null, indexed };
  } catch (err) {
    return fail(writeFailure(err, "unlike"), "unlike", asOrg);
  }
}
