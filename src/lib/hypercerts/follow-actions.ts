"use server";

// Follow and unfollow an account or a project, as the account the user acts
// as (their own, or an organization through CGS), written with the Hypercerts
// SDK: an account follow (app.certified.graph.follow) for an account's DID,
// an entity follow (app.certified.graph.entityFollow) for a project's URI.
// Each waits for the index to show the change, then expires the cached pages
// it changes, so the page the action returns with (and every page after)
// shows it.

import type { SDKContext, WriteOptions } from "@hypercerts-org/sdk";
import {
  followAccount,
  followEntity,
  unfollowAccount,
  unfollowEntity,
} from "@hypercerts-org/sdk/social";
import { updateTag } from "next/cache";
import { getOAuthSession } from "@/lib/auth/dal";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { mayPublish } from "@/lib/hypercerts/publish-access";
import { getIndexedEntityFollow, getIndexedFollow } from "@/lib/hypercerts/queries";
import { sdkContext, writeFailure, writeTo } from "@/lib/hypercerts/sdk";
import { collectionOf, didOf, type FollowRef } from "@/lib/hypercerts/views";
import { logError } from "@/lib/log";
import { isAtUri, isDid } from "@/lib/validate";

type FollowFailure = "signed-out" | "forbidden" | "invalid" | "unknown" | "unavailable";
type Action = "follow" | "unfollow";
type Kind = "account" | "project";

export type FollowFailed = { ok: false; reason: FollowFailure; message: string };
/**
 * `follow`: the follow record after the action (null after an unfollow).
 * `indexed`: the index showed the change before the action gave up waiting.
 */
export type FollowResult = { ok: true; follow: FollowRef; indexed: boolean } | FollowFailed;
export type UnfollowResult = { ok: true; follow: null; indexed: boolean } | FollowFailed;

/** What can be followed: an account by its DID, a project by its URI. */
function kindOf(subject: unknown): Kind | null {
  if (typeof subject !== "string") return null;
  if (isDid(subject)) return "account";
  if (isAtUri(subject) && collectionOf(subject) === "org.hypercerts.collection") return "project";
  return null;
}

type Repo = WriteOptions | undefined;

/** How each kind is followed, looked up, unfollowed and expired. */
const KINDS: Record<
  Kind,
  {
    indexed: (actor: string, subject: string) => Promise<FollowRef | null>;
    create: (context: SDKContext, subject: string, repo: Repo) => Promise<FollowRef>;
    remove: (context: SDKContext, uri: string, repo: Repo) => Promise<void>;
    /** The cache tags a follow of `subject` by `actor` changes. */
    expire: (actor: string, subject: string) => string[];
  }
> = {
  account: {
    indexed: getIndexedFollow,
    create: (context, did, repo) => followAccount(context, { subject: { did } }, repo),
    remove: (context, uri, repo) => unfollowAccount(context, { follow: { uri } }, repo),
    // Both accounts' follows (counts, lists, the button) and feeds.
    expire: (actor, did) => [actor, did].flatMap((d) => [tags.follows(d), tags.actor(d)]),
  },
  project: {
    indexed: getIndexedEntityFollow,
    create: (context, uri, repo) => followEntity(context, { subject: { uri } }, repo),
    remove: (context, uri, repo) => unfollowEntity(context, { follow: { uri } }, repo),
    // The follower's follows (the button) and feed; the project's followers.
    expire: (actor, uri) => [tags.follows(actor), tags.actor(actor), tags.project(uri)],
  },
};

/**
 * What went wrong, for the toast. `asOrganization`: the write went through
 * CGS, where any member may follow, but only admins and owners may delete a
 * record another member made.
 */
function message(reason: FollowFailure, action: Action, kind: Kind, asOrganization: boolean) {
  switch (reason) {
    case "signed-out":
      return action === "follow"
        ? `Your session has ended. Sign in again to follow ${kind}s.`
        : `Your session has ended. Sign in again to unfollow ${kind}s.`;
    case "forbidden":
      if (!asOrganization) {
        return "Your sign-in doesn't allow this. Sign out and sign in again.";
      }
      return action === "follow"
        ? "The group refused the follow. Check that you're still a member."
        : "Only the group's admins and owners can undo a follow another member made.";
    case "invalid":
      return action === "follow"
        ? `This ${kind} can't be followed.`
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

/** Who writes, and how: known once the request checks out. */
type Writer = {
  session: NonNullable<Awaited<ReturnType<typeof getOAuthSession>>>;
  actor: string;
  subject: string;
  kind: Kind;
  repo: Repo;
  asOrganization: boolean;
};

const failure = (reason: FollowFailure, action: Action, w?: Partial<Writer>): FollowFailed => ({
  ok: false,
  reason,
  message: message(reason, action, w?.kind ?? "account", w?.asOrganization ?? false),
});

/** The session, and the explicit repository `repo`, when it may follow `subject`. */
async function writer(
  repo: unknown,
  subject: unknown,
  action: Action,
): Promise<Writer | FollowFailed> {
  const kind = kindOf(subject);
  if (!kind || typeof repo !== "string" || !isDid(repo)) return failure("invalid", action);
  const session = await getOAuthSession();
  if (!session) return failure("signed-out", action, { kind });
  const target = subject as string;
  const asOrganization = repo !== session.did;
  // Not yourself, nor your own project.
  if (repo === (kind === "account" ? target : didOf(target))) {
    return failure("invalid", action, { kind, asOrganization });
  }
  if (!(await mayPublish(session, repo))) {
    return failure("forbidden", action, { kind, asOrganization });
  }
  return {
    session,
    actor: repo,
    subject: target,
    kind,
    repo: writeTo(session, repo),
    asOrganization,
  };
}

function expire(tagged: string[]) {
  for (const tag of tagged) updateTag(tag);
}

/**
 * Follows `subject` as `repo`: an account's DID, or a project's URI. When the
 * index already shows a follow (made in another tab, say), returns that one
 * rather than writing a duplicate.
 */
export async function follow(input: { repo: string; subject: string }): Promise<FollowResult> {
  let w: Writer | FollowFailed | undefined;
  try {
    w = await writer(input?.repo, input?.subject, "follow");
    if ("ok" in w) return w;
    const { actor, subject: target } = w;
    const how = KINDS[w.kind];
    const existing = await how.indexed(actor, target).catch((err) => {
      logError("[follow] index check failed", err, { actor, target });
      return null;
    });
    if (existing) return { ok: true, follow: existing, indexed: true };
    const made = await how.create(await sdkContext(w.session), target, w.repo);
    const indexed = await waitForIndex(async () => (await how.indexed(actor, target)) !== null);
    expire(how.expire(actor, target));
    return { ok: true, follow: { uri: made.uri, cid: made.cid }, indexed };
  } catch (err) {
    return failure(writeFailure(err, "follow"), "follow", w && !("ok" in w) ? w : undefined);
  }
}

/**
 * Unfollows `subject` as `repo`: deletes the follow records the browser knows
 * of (`uris`: one the index didn't show yet) and the one the index shows.
 * Safe to repeat.
 */
export async function unfollow(input: {
  repo: string;
  subject: string;
  uris: string[];
}): Promise<UnfollowResult> {
  let w: Writer | FollowFailed | undefined;
  try {
    w = await writer(input?.repo, input?.subject, "unfollow");
    if ("ok" in w) return w;
    const { actor, subject: target } = w;
    const how = KINDS[w.kind];
    const known = Array.isArray(input.uris) ? input.uris : [];
    if (known.length > 5 || known.some((uri) => typeof uri !== "string")) {
      return failure("invalid", "unfollow", w);
    }
    const shown = await how.indexed(actor, target).catch((err) => {
      logError("[unfollow] index check failed", err, { actor, target });
      return null;
    });
    const removed = [...new Set([...known, ...(shown ? [shown.uri] : [])])];
    const context = await sdkContext(w.session);
    // One at a time: each is its own write, and a failure stops the rest.
    for (const uri of removed) await how.remove(context, uri, w.repo);
    // Done once the index shows none of them (a follow made since, elsewhere, may remain).
    const indexed = await waitForIndex(async () => {
      const left = await how.indexed(actor, target);
      return left === null || !removed.includes(left.uri);
    });
    expire(how.expire(actor, target));
    return { ok: true, follow: null, indexed };
  } catch (err) {
    return failure(writeFailure(err, "unfollow"), "unfollow", w && !("ok" in w) ? w : undefined);
  }
}
