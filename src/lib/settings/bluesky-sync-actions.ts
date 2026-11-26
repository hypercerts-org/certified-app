"use server";

// Server Actions for Bluesky sync: comparing and syncing follows between
// Certified (`app.certified.graph.follow`) and Bluesky (`app.bsky.graph.follow`).

import { type l, XrpcResponseError } from "@atproto/lex";
import { followAccount } from "@hypercerts-org/sdk/social";
import { updateTag } from "next/cache";
import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { isMember } from "@/lib/cgs";
import { tags } from "@/lib/hypercerts/cache";
import { getActorCards } from "@/lib/hypercerts/queries";
import { sdkContext, writeFailure, writeTo } from "@/lib/hypercerts/sdk";
import type { ActorCard } from "@/lib/hypercerts/views";
import { createBlueskyFollow, repositoryFor, WriteError } from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";
import { isDid } from "@/lib/validate";
import type { ActionFailure, SocialGraphComparison, SocialGraphSyncBatchResult } from "./types";

const MAX_FOLLOW_SCAN = 10_000;
const MAX_SYNC_BATCH = 25;

function extractSubjectDid(value: Record<string, unknown>): string | null {
  const subject = value.subject;
  if (typeof subject === "string" && isDid(subject)) return subject;
  if (subject && typeof subject === "object") {
    const did = (subject as { did?: unknown }).did;
    if (typeof did === "string" && isDid(did)) return did;
  }
  return null;
}

async function listFollowSubjects(
  repo: Awaited<ReturnType<typeof repositoryFor>>,
  collection: l.NsidString,
): Promise<{ subjects: Set<string>; truncated: boolean }> {
  const subjects = new Set<string>();
  let cursor: string | undefined;
  let scanned = 0;
  let truncated = false;
  while (scanned < MAX_FOLLOW_SCAN) {
    const page = await repo.listRecords(collection, { limit: 100, cursor });
    for (const record of page.records) {
      scanned++;
      const did = extractSubjectDid(record.value);
      if (did) subjects.add(did);
    }
    if (!page.cursor || page.cursor === cursor) break;
    cursor = page.cursor;
    if (scanned >= MAX_FOLLOW_SCAN) {
      truncated = true;
      break;
    }
  }
  return { subjects, truncated };
}

/**
 * Compares `repoDid`'s Certified follows (`app.certified.graph.follow`) with
 * its Bluesky follows (`app.bsky.graph.follow`) directly from its PDS.
 */
export async function compareSocialGraph(
  repoDid: string,
): Promise<({ ok: true } & SocialGraphComparison) | ActionFailure> {
  if (typeof repoDid !== "string" || !isDid(repoDid)) {
    return { ok: false, message: "Invalid account." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
    if (!(await isMember(session, repoDid))) {
      return { ok: false, message: "You don't have access to sync this account's follows." };
    }

    const repo = await repositoryFor(session, repoDid as l.DidString);
    const [certified, bluesky] = await Promise.all([
      listFollowSubjects(repo, "app.certified.graph.follow"),
      listFollowSubjects(repo, "app.bsky.graph.follow"),
    ]);

    let inBothCount = 0;
    const onlyCertifiedDids: string[] = [];
    const onlyBlueskyDids: string[] = [];
    for (const did of certified.subjects) {
      if (bluesky.subjects.has(did)) inBothCount++;
      else onlyCertifiedDids.push(did);
    }
    for (const did of bluesky.subjects) {
      if (!certified.subjects.has(did)) onlyBlueskyDids.push(did);
    }

    // Resolve actor cards in bounded chunks for display in the pick modal.
    const allCandidateDids = [...new Set([...onlyBlueskyDids, ...onlyCertifiedDids])];
    const cardsByDid = new Map<string, ActorCard>();
    for (let i = 0; i < allCandidateDids.length; i += 100) {
      const slice = allCandidateDids.slice(i, i + 100);
      const cards = await getActorCards(slice);
      for (const card of cards) cardsByDid.set(card.did, card);
    }
    const toCard = (did: string): ActorCard =>
      cardsByDid.get(did) ?? {
        did,
        handle: null,
        displayName: did,
        description: null,
        avatarUrl: null,
        isOrganization: false,
      };

    return {
      ok: true,
      certifiedCount: certified.subjects.size,
      blueskyCount: bluesky.subjects.size,
      inBothCount,
      onlyBluesky: onlyBlueskyDids.map(toCard),
      onlyCertified: onlyCertifiedDids.map(toCard),
      certifiedTruncated: certified.truncated,
      blueskyTruncated: bluesky.truncated,
    };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] compareSocialGraph failed", err, { repoDid });
    }
    return { ok: false, message: "Couldn't compare your follow graphs right now." };
  }
}

/**
 * Imports selected Bluesky follows into `repoDid`'s Certified graph using
 * `@hypercerts-org/sdk/social` (`followAccount`).
 */
export async function importBlueskyFollows(
  repoDid: string,
  subjectDids: string[],
): Promise<SocialGraphSyncBatchResult | ActionFailure> {
  if (typeof repoDid !== "string" || !isDid(repoDid) || !Array.isArray(subjectDids)) {
    return { ok: false, message: "Invalid sync request." };
  }
  const uniqueDids = [...new Set(subjectDids)]
    .filter((did): did is string => typeof did === "string" && isDid(did) && did !== repoDid)
    .slice(0, MAX_SYNC_BATCH);
  if (uniqueDids.length === 0) {
    return { ok: true, imported: 0, failed: 0, errors: [] };
  }

  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
    if (!(await isMember(session, repoDid))) {
      return { ok: false, message: "You don't have permission to follow as this account." };
    }

    const context = await sdkContext(session);
    const repoOpt = writeTo(session, repoDid);
    const importedDids: string[] = [];
    const errors: { subjectDid: string; message: string }[] = [];

    for (const subjectDid of uniqueDids) {
      try {
        await followAccount(context, { subject: { did: subjectDid } }, repoOpt);
        importedDids.push(subjectDid);
      } catch (err) {
        const reason = writeFailure(err, "importBlueskyFollow");
        errors.push({
          subjectDid,
          message:
            reason === "unknown"
              ? "Couldn't confirm whether this follow was imported. Reload to check."
              : "Couldn't import this follow.",
        });
      }
    }

    if (importedDids.length > 0) {
      updateTag(tags.follows(repoDid));
      updateTag(tags.actor(repoDid));
      for (const subjectDid of importedDids) {
        updateTag(tags.follows(subjectDid));
        updateTag(tags.actor(subjectDid));
      }
    }
    return { ok: true, imported: importedDids.length, failed: errors.length, errors };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] importBlueskyFollows failed", err, { repoDid });
    }
    return { ok: false, message: "Couldn't import follows right now. Please try again." };
  }
}

/**
 * Exports selected Certified follows to the signed-in user's Bluesky graph
 * (`app.bsky.graph.follow`). Personal accounts only.
 */
export async function exportCertifiedFollowsToBluesky(
  subjectDids: string[],
): Promise<SocialGraphSyncBatchResult | ActionFailure> {
  if (!Array.isArray(subjectDids)) {
    return { ok: false, message: "Invalid sync request." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    const uniqueDids = [...new Set(subjectDids)]
      .filter((did): did is string => typeof did === "string" && isDid(did) && did !== session.did)
      .slice(0, MAX_SYNC_BATCH);
    if (uniqueDids.length === 0) {
      return { ok: true, imported: 0, failed: 0, errors: [] };
    }

    let imported = 0;
    const errors: { subjectDid: string; message: string }[] = [];

    for (const subjectDid of uniqueDids) {
      try {
        await createBlueskyFollow(session, subjectDid as l.DidString);
        imported++;
      } catch (err) {
        const unknown =
          (err instanceof WriteError && err.reason === "unknown") ||
          (!(err instanceof WriteError) && !(err instanceof XrpcResponseError));
        logError("[settings] exportCertifiedFollow failed", err, { subjectDid });
        errors.push({
          subjectDid,
          message: unknown
            ? "Couldn't confirm whether this follow was added on Bluesky. Reload to check."
            : "Couldn't add this follow on Bluesky.",
        });
      }
    }

    return { ok: true, imported, failed: errors.length, errors };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] exportCertifiedFollowsToBluesky failed", err);
    }
    return { ok: false, message: "Couldn't export follows right now. Please try again." };
  }
}
