"use server";

// Endorse and unendorse an account, as the account the user acts as (their own,
// or an organization through CGS). Endorsing uses the Hypercerts SDK's
// awardBadge: on the first endorsement it creates the account's plain
// "Endorsement" badge definition (badgeType "endorsement") alongside the award;
// on subsequent endorsements it reuses that definition by URI. Revoking deletes
// the award record(s) through writes.ts until the SDK supports award deletion.
// Each action waits for the index to show the change, then expires every cached
// page it affects.

import type { l } from "@atproto/lex";
import { awardBadge } from "@hypercerts-org/sdk/badge";
import { updateTag } from "next/cache";
import { getActingAs } from "@/lib/acting-as";
import { getOAuthSession } from "@/lib/auth/dal";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { getIndexedEndorsement, getIndexedEndorsements } from "@/lib/hypercerts/queries";
import { sdkContext, writeFailure, writeTo } from "@/lib/hypercerts/sdk";
import {
  collectionOf,
  didOf,
  ENDORSEMENT_BADGE_TYPE,
  type EndorsementRef,
  PLAIN_ENDORSEMENT,
} from "@/lib/hypercerts/views";
import {
  deleteBadgeAward,
  findEndorsementDefinition,
  repositoryFor,
  WriteError,
} from "@/lib/hypercerts/writes";
import { isAtUri, isDid } from "@/lib/validate";

type EndorseFailure = "signed-out" | "forbidden" | "invalid" | "unknown" | "unavailable";
type Action = "endorse" | "unendorse";

export type EndorseFailed = { ok: false; reason: EndorseFailure; message: string };
/**
 * `endorsement`: the award record after the action (null after revoking).
 * `indexed`: the index showed the change before the action gave up waiting.
 */
export type EndorseResult =
  | { ok: true; endorsement: EndorsementRef; indexed: boolean }
  | EndorseFailed;
export type UnendorseResult = { ok: true; endorsement: null; indexed: boolean } | EndorseFailed;

const AWARD_COLLECTION = "app.certified.badge.award";

/**
 * What went wrong, for the toast. `asOrganization`: the write went through
 * CGS, where any member may endorse, but only admins and owners may delete a
 * record another member made.
 */
function message(reason: EndorseFailure, action: Action, asOrganization: boolean) {
  switch (reason) {
    case "signed-out":
      return action === "endorse"
        ? "Your session has ended. Sign in again to endorse accounts."
        : "Your session has ended. Sign in again to revoke endorsements.";
    case "forbidden":
      if (!asOrganization) {
        return "Your sign-in doesn't allow this. Sign out and sign in again.";
      }
      return action === "endorse"
        ? "The organization refused the endorsement. Check that you're still a member."
        : "Only the organization's admins and owners can revoke an endorsement another member made.";
    case "invalid":
      return action === "endorse"
        ? "This account can't be endorsed."
        : "This endorsement couldn't be revoked.";
    case "unknown":
      return action === "endorse"
        ? "We couldn't confirm the endorsement. Reload to check."
        : "We couldn't confirm revoking the endorsement. Reload to check.";
    case "unavailable":
      return action === "endorse"
        ? "The endorsement didn't go through. Please try again."
        : "Revoking the endorsement didn't go through. Please try again.";
  }
}

/** Who writes, and how: known once the request checks out. */
type Writer = {
  session: NonNullable<Awaited<ReturnType<typeof getOAuthSession>>>;
  actor: l.DidString;
  subject: l.DidString;
  asOrganization: boolean;
};

const failure = (reason: EndorseFailure, action: Action, w?: Partial<Writer>): EndorseFailed => ({
  ok: false,
  reason,
  message: message(reason, action, w?.asOrganization ?? false),
});

/** The session, and the account it acts as, when that may endorse `subject`. */
async function writer(subject: unknown, action: Action): Promise<Writer | EndorseFailed> {
  if (typeof subject !== "string" || !isDid(subject)) return failure("invalid", action);
  const [session, actor] = await Promise.all([getOAuthSession(), getActingAs()]);
  if (!session || !actor) return failure("signed-out", action);
  if (actor === subject) return failure("invalid", action);
  return {
    session,
    actor: actor as l.DidString,
    subject: subject as l.DidString,
    asOrganization: actor !== session.did,
  };
}

/** The record key of a badge award URI belonging to `actor`, or null. */
function awardRkey(uri: string, actor: string): string | null {
  if (!isAtUri(uri) || didOf(uri) !== actor || collectionOf(uri) !== AWARD_COLLECTION) {
    return null;
  }
  const parts = uri.slice("at://".length).split("/");
  return parts.length === 3 && parts[2] ? parts[2] : null;
}

/** Cache tags an endorsement of `subject` by `actor` changes. */
function expire(actor: string, subject: string) {
  for (const did of [actor, subject]) {
    updateTag(tags.endorsements(did));
    updateTag(tags.actor(did));
  }
}

function failureReason(err: unknown, what: string): EndorseFailure {
  if (err instanceof WriteError) {
    return err.reason === "conflict" ? "unavailable" : err.reason;
  }
  return writeFailure(err, what);
}

/**
 * Endorses account `subject` as the account the user acts as. When the index
 * already shows a plain endorsement (made in another tab, say), returns that
 * one rather than writing a duplicate.
 */
export async function endorse(subject: string): Promise<EndorseResult> {
  let w: Writer | EndorseFailed | undefined;
  try {
    w = await writer(subject, "endorse");
    if ("ok" in w) return w;
    const { session, actor, subject: target } = w;
    const existing = await getIndexedEndorsement(actor, target).catch(() => null);
    if (existing) return { ok: true, endorsement: existing, indexed: true };

    const repo = await repositoryFor(session, actor);
    const definitionUri = await findEndorsementDefinition(repo);
    const made = await awardBadge(
      sdkContext(session),
      {
        definition: definitionUri
          ? { uri: definitionUri }
          : { title: PLAIN_ENDORSEMENT, badgeType: ENDORSEMENT_BADGE_TYPE },
        subject: { did: target },
      },
      writeTo(session, actor),
    );
    const indexed = await waitForIndex(
      async () => (await getIndexedEndorsement(actor, target)) !== null,
    );
    expire(actor, target);
    return { ok: true, endorsement: { uri: made.uri, cid: made.cid }, indexed };
  } catch (err) {
    return failure(failureReason(err, "endorse"), "endorse", w && !("ok" in w) ? w : undefined);
  }
}

/**
 * Revokes plain endorsement(s) of `subject`: deletes the award records the
 * browser knows of (`uris`: one the index didn't show yet) and any the index
 * shows. Safe to repeat.
 */
export async function unendorse(input: {
  subject: string;
  uris: string[];
}): Promise<UnendorseResult> {
  let w: Writer | EndorseFailed | undefined;
  try {
    w = await writer(input?.subject, "unendorse");
    if ("ok" in w) return w;
    const { session, actor, subject: target } = w;
    const known = Array.isArray(input.uris) ? input.uris : [];
    if (
      known.length > 5 ||
      known.some((uri) => typeof uri !== "string" || !awardRkey(uri, actor))
    ) {
      return failure("invalid", "unendorse", w);
    }
    const shown = await getIndexedEndorsements(actor, target).catch(() => []);
    const removed = [...new Set([...known, ...shown.map((award) => award.uri)])];
    const repo = await repositoryFor(session, actor);
    // One at a time: each is its own write, and a failure stops the rest.
    for (const uri of removed) {
      const rkey = awardRkey(uri, actor);
      if (!rkey) return failure("invalid", "unendorse", w);
      await deleteBadgeAward(repo, rkey);
    }
    // Done once the index shows none of the removed awards.
    const indexed = await waitForIndex(async () => {
      const left = await getIndexedEndorsements(actor, target);
      return left.every((award) => !removed.includes(award.uri));
    });
    expire(actor, target);
    return { ok: true, endorsement: null, indexed };
  } catch (err) {
    return failure(failureReason(err, "unendorse"), "unendorse", w && !("ok" in w) ? w : undefined);
  }
}
