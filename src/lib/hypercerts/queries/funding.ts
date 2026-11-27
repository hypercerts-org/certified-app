// Funding receipt ledger and summary read queries.
import "server-only";

import { org } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { tags } from "../cache";
import {
  type ActorCard,
  type Page,
  type Receipt,
  toActivityCard,
  toActorCard,
  toProjectCard,
  toReceipt,
  totalsByCurrency,
} from "../views";
import { getActorCards } from "./actors";
import {
  type AtUri,
  activityHrefOf,
  api,
  chunks,
  type Did,
  projectHrefOf,
  publicData,
  read,
  withHandles,
} from "./client";

// with its accounts (sender, recipient, platform, recorder) and what it is
// for resolved. Summaries page through the receipts (the API gives no
// totals), up to FUNDING_PAGES pages.

/**
 * Receipts to or from an account, for a record, or confirmed by an account:
 * written by it, as the platform that processed the payments does (staging's
 * "Confirmed by"; the API filters by author, not by `via`).
 */
export type ReceiptFilter = { to: string } | { from: string } | { for: string } | { by: string };

export type ReceiptRow = Receipt & {
  fromActor: ActorCard | null;
  toActor: ActorCard | null;
  /** Who recorded it: the "Confirmed by" column. */
  recorder: ActorCard;
  /** What it is for, when that is a project or an activity. */
  forTitle: string | null;
  forHref: string | null;
};

/**
 * Pages of receipts a summary reads: 20,000 receipts, enough for every
 * account today (Ma Earth confirmed about 15,000). The API gives no totals.
 */
const FUNDING_PAGES = 200;

function receiptParams(filter: ReceiptFilter) {
  if ("to" in filter) return { to: [filter.to] };
  if ("from" in filter) return { from: [filter.from] };
  if ("by" in filter) return { authors: [filter.by as Did] };
  return { forUris: [filter.for as AtUri] };
}

/** A page of receipts, newest first, with their accounts and subjects. */
export async function listReceiptsPage(
  filter: ReceiptFilter,
  cursor?: string,
): Promise<Page<ReceiptRow>> {
  "use cache";
  publicData(tags.funding(Object.values(filter)[0]));

  const out = await api.call(
    org.hypercerts.funding.listReceipts,
    { ...receiptParams(filter), limit: 50, cursor },
    read(),
  );
  const receipts = out.receipts.map((view) => ({
    receipt: toReceipt({
      uri: view.uri,
      did: view.did,
      record: view.record as Record<string, unknown>,
    }),
    recorder: toActorCard(view.author),
  }));

  // Every account named, and every project or activity funded: batched.
  const dids = new Set<string>();
  const forUris: string[] = [];
  for (const { receipt } of receipts) {
    for (const p of [receipt.from, receipt.to]) if (p.kind === "account") dids.add(p.did);
    if (receipt.forUri) forUris.push(receipt.forUri);
  }
  const subjects = new Map<string, { title: string; href: string }>();
  await Promise.all([
    ...chunks([
      ...new Set(forUris.filter((uri) => uri.includes("/org.hypercerts.collection/"))),
    ]).map(async (batch) => {
      const page = await api.call(
        org.hypercerts.collection.listCollections,
        { uris: batch as AtUri[], limit: 100 },
        read(),
      );
      for (const view of page.collections) {
        const project = toProjectCard(view);
        subjects.set(view.uri, { title: project.title, href: projectHrefOf(project) });
      }
    }),
    ...chunks([
      ...new Set(forUris.filter((uri) => uri.includes("/org.hypercerts.claim.activity/"))),
    ]).map(async (batch) => {
      const page = await api.call(
        org.hypercerts.claim.listActivities,
        { uris: batch as AtUri[], limit: 100 },
        read(),
      );
      for (const view of page.activities) {
        const activity = toActivityCard(view);
        subjects.set(view.uri, { title: activity.title, href: activityHrefOf(activity.uri) });
      }
    }),
  ]);
  const actors = new Map(
    (await withHandles(await getActorCards([...dids]))).map((actor) => [actor.did, actor]),
  );
  const [recorders] = [await withHandles(receipts.map((r) => r.recorder))];

  return {
    items: receipts.map(({ receipt }, i) => {
      const subject = receipt.forUri ? subjects.get(receipt.forUri) : undefined;
      return {
        ...receipt,
        fromActor: receipt.from.kind === "account" ? (actors.get(receipt.from.did) ?? null) : null,
        toActor: receipt.to.kind === "account" ? (actors.get(receipt.to.did) ?? null) : null,
        recorder: recorders[i],
        forTitle: subject?.title ?? null,
        forHref: subject?.href ?? null,
      };
    }),
    cursor: out.cursor ?? null,
  };
}

export type FundingSummary = {
  /** Totals by currency, largest first. */
  totals: { currency: string; amount: string }[];
  gifts: number;
  /** Distinct senders named (an account or a wallet). */
  namedDonors: number;
  anonymousGifts: number;
  /** Whether it stopped at FUNDING_PAGES with more to read. */
  capped: boolean;
};

/**
 * What the receipts add up to: totals, gifts, donors. Kept for hours, not the
 * minute public data is: a large account takes many calls to add up.
 */
export async function getFundingSummary(filter: ReceiptFilter): Promise<FundingSummary> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.funding(Object.values(filter)[0]));

  const receipts: Receipt[] = [];
  let cursor: string | undefined;
  let capped = false;
  for (let page = 0; page < FUNDING_PAGES; page++) {
    const out = await api.call(
      org.hypercerts.funding.listReceipts,
      { ...receiptParams(filter), limit: 100, cursor },
      read(),
    );
    for (const view of out.receipts) {
      receipts.push(
        toReceipt({ uri: view.uri, did: view.did, record: view.record as Record<string, unknown> }),
      );
    }
    cursor = out.cursor;
    if (!cursor) break;
    if (page === FUNDING_PAGES - 1) capped = true;
  }
  const donors = new Set(
    receipts.flatMap((r) =>
      r.from.kind === "account" ? [r.from.did] : r.from.kind === "text" ? [r.from.value] : [],
    ),
  );
  return {
    totals: totalsByCurrency(receipts),
    gifts: receipts.length,
    namedDonors: donors.size,
    anonymousGifts: receipts.filter((r) => r.from.kind === "anonymous").length,
    capped,
  };
}

/** Whether an account received, gave or confirmed any funding: its profile's Funding tab. */
export async function hasFunding(
  did: string,
): Promise<{ received: boolean; given: boolean; confirmed: boolean }> {
  "use cache";
  publicData(tags.funding(did));

  const [received, given, confirmed] = await Promise.all([
    api.call(org.hypercerts.funding.listReceipts, { to: [did], limit: 1 }, read()),
    api.call(org.hypercerts.funding.listReceipts, { from: [did], limit: 1 }, read()),
    api.call(org.hypercerts.funding.listReceipts, { authors: [did as Did], limit: 1 }, read()),
  ]);
  return {
    received: received.receipts.length > 0,
    given: given.receipts.length > 0,
    confirmed: confirmed.receipts.length > 0,
  };
}
