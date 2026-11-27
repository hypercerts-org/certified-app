// Client for the Hypercerts Feed / Views service (`https://feed.hypercerts.dev`).
//
// Isolated behind one module so the upcoming transition from the feed service
// to the Views service (endorsement graph, network feed, and account / project /
// activity timelines) only changes code here.
//
// Wire contract: `POST /xrpc/org.hypercerts.feed.getFeed` with
// `{ feedId, params?, limit?, cursor? }`. Anonymous viewer-scoped reads pass
// `params.viewerDid` (works identically for personal accounts and CGS groups).
import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import {
  DEFAULT_ORG_QUALITY,
  type FeedEventKind,
  type NetworkFeedEntry,
  type OrgQualityTier,
} from "@/lib/feed-grouping";
import { tags } from "@/lib/hypercerts/cache";
import { getActorCards, getList, resolveListItems } from "@/lib/hypercerts/queries";
import {
  type ActorCard,
  avatarUrl,
  type FeedLink,
  formatDate,
  imageUrl,
  type Page,
} from "@/lib/hypercerts/views";
import { getHandle } from "@/lib/identity";
import { logError } from "@/lib/log";
import { activityHref, projectHref } from "@/lib/routes";
import { isAtUri, isDid } from "@/lib/validate";

export const FEED_SERVICE_URL = new URL(
  process.env.HYPERCERTS_FEED_URL || "https://feed.hypercerts.dev",
);
if (
  FEED_SERVICE_URL.protocol !== "https:" &&
  !["127.0.0.1", "[::1]", "localhost"].includes(FEED_SERVICE_URL.hostname)
) {
  throw new Error("HYPERCERTS_FEED_URL must use https (http only on a loopback address).");
}

/** Feed ID for the Hypercerts viewer-scope network feed. */
export const HYPERCERTS_FEED_ID = "org.hypercerts.feed.defs#hypercertsFeed";
const HYPERCERTS_FEED_PARAMS_TYPE = "org.hypercerts.feed.defs#hypercertsFeedParams";
const HYPERCERTS_FEED_VIEW_TYPE = "org.hypercerts.feed.defs#hypercertsFeedView";

/**
 * Curated `list:accounts` record holding Certified's default trusted endorsers,
 * editable in-app without a deploy.
 */
const TRUSTED_EVALUATORS_DID = "did:plc:apun3uo5jqm34pxzqq6on754";
const TRUSTED_EVALUATORS_RKEY = "3moknbntllx2s";

const FEED_TIMEOUT_MS = 10_000;
const DEFAULT_FEED_LIMIT = 30;
const MAX_FEED_LIMIT = 50;

export class FeedServiceError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "FeedServiceError";
    this.status = status;
    this.code = code;
  }
}

type WireActorSummary = {
  did?: unknown;
  displayName?: unknown;
  avatar?: unknown;
};

type WireFeedEntry = {
  subject?: unknown;
  view?: unknown;
};

type WireFeedResponse = {
  feed?: unknown;
  cursor?: unknown;
};

/** Generic transport for any feed/view algorithm hosted on the Feed/Views service. */
export async function callFeed<TParams extends Record<string, unknown>>(
  feedId: string,
  params: TParams,
  options: { limit?: number; cursor?: string } = {},
): Promise<{ feed: WireFeedEntry[]; cursor: string | null }> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT));
  const body: Record<string, unknown> = {
    feedId,
    params,
    limit,
    ...(options.cursor ? { cursor: options.cursor } : {}),
  };

  const url = new URL("/xrpc/org.hypercerts.feed.getFeed", FEED_SERVICE_URL);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!res.ok) {
    let code: string | null = null;
    let message = `Feed service returned HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: unknown; message?: unknown };
      if (typeof errBody.error === "string") code = errBody.error;
      if (typeof errBody.message === "string" && errBody.message.trim()) {
        message = errBody.message.trim();
      }
    } catch {
      // Non-JSON error body; keep generic status message.
    }
    throw new FeedServiceError(message, res.status, code);
  }

  const data = (await res.json()) as WireFeedResponse;
  const feed = Array.isArray(data.feed) ? (data.feed as WireFeedEntry[]) : [];
  const cursor = typeof data.cursor === "string" && data.cursor ? data.cursor : null;
  return { feed, cursor };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveMediaUrl(did: string, raw: unknown): string | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  if (rec.$type === "org.hypercerts.defs#smallBlob") {
    return imageUrl(did, { image: rec.blob }, "card");
  }
  return imageUrl(did, rec, "card");
}

function formatPeriod(startDate: string | null, endDate: string | null): string | null {
  const start = startDate ? formatDate(startDate) : null;
  const end = endDate ? formatDate(endDate) : null;
  if (start && end) return start === end ? start : `${start} – ${end}`;
  if (start) return `${start} (ongoing)`;
  if (end) return `Until ${end}`;
  return null;
}

function toActor(
  raw: WireActorSummary | null,
  handles: Map<string, string | null>,
): ActorCard | null {
  const did = asString(raw?.did);
  if (!did || !isDid(did)) return null;
  const handle = handles.get(did) ?? null;
  const displayName = asString(raw?.displayName) ?? (handle ? `@${handle}` : did);
  return {
    did,
    handle,
    displayName,
    description: null,
    avatarUrl: raw?.avatar ? avatarUrl(did, raw.avatar) : null,
    isOrganization: false,
  };
}

function hrefForAtUri(uri: string): string | null {
  if (!isAtUri(uri)) return null;
  const [, , authorDid, collection, rkey] = uri.split("/");
  if (!authorDid || !collection || !rkey) return null;
  if (collection === "org.hypercerts.claim.activity") return activityHref(uri);
  if (collection === "org.hypercerts.collection") return projectHref({ authorDid, rkey });
  if (
    collection === "app.certified.actor.profile" ||
    collection === "app.certified.actor.organization"
  ) {
    return `/${authorDid}`;
  }
  return null;
}

function fallbackTitleForAtUri(uri: string): string {
  const collection = uri.split("/")[3];
  if (collection === "org.hypercerts.claim.activity") return "an activity";
  if (collection === "org.hypercerts.collection") return "a project";
  return "a record";
}

function extractTargetUri(content: Record<string, unknown> | null): string | null {
  const target = asRecord(content?.target);
  const uri = asString(target?.uri);
  return uri && isAtUri(uri) ? uri : null;
}

function collectDidsAndTargets(entries: WireFeedEntry[]) {
  const dids = new Set<string>();
  const targetUris = new Set<string>();
  for (const item of entries) {
    const view = asRecord(item?.view);
    if (!view || view.$type !== HYPERCERTS_FEED_VIEW_TYPE) continue;
    const actor = asRecord(view.actor);
    const actorDid = asString(actor?.did);
    if (actorDid && isDid(actorDid)) dids.add(actorDid);

    const content = asRecord(view.content);
    const subjectActor = asRecord(content?.subject);
    const subjectDid = asString(subjectActor?.did);
    if (subjectDid && isDid(subjectDid)) dids.add(subjectDid);

    const targetUri = extractTargetUri(content);
    if (targetUri) targetUris.add(targetUri);
  }
  return { dids: [...dids], targetUris: [...targetUris] };
}

async function resolveTargetLinks(uris: string[]): Promise<Map<string, FeedLink>> {
  const links = new Map<string, FeedLink>();
  if (uris.length === 0) return links;

  try {
    const resolved = await resolveListItems(uris);
    for (const item of resolved) {
      if (item.kind === "activity") {
        const href = hrefForAtUri(item.uri);
        if (href) links.set(item.uri, { title: item.activity.title, href });
      } else if (item.kind === "project") {
        links.set(item.uri, {
          title: item.project.title,
          href: projectHref(item.project),
        });
      }
    }
  } catch (err) {
    logError("[feed] target link resolution failed", err);
  }

  for (const uri of uris) {
    if (!links.has(uri)) {
      const href = hrefForAtUri(uri);
      if (href) links.set(uri, { title: fallbackTitleForAtUri(uri), href });
    }
  }
  return links;
}

function mapWireEntry(
  item: WireFeedEntry,
  handles: Map<string, string | null>,
  targetLinks: Map<string, FeedLink>,
): NetworkFeedEntry | null {
  const uri = asString(item?.subject);
  const view = asRecord(item?.view);
  if (!uri || !isAtUri(uri) || !view || view.$type !== HYPERCERTS_FEED_VIEW_TYPE) return null;

  const actor = toActor(asRecord(view.actor), handles);
  if (!actor) return null;

  const kind = asString(view.kind);
  const content = asRecord(view.content);
  if (!kind || !content) return null;

  const createdAt = asString(content.createdAt);
  const date = formatDate(createdAt);
  const base = { uri, actor, date, createdAt };

  switch (kind) {
    case "cert.create": {
      const title = asString(content.title);
      const href = hrefForAtUri(uri);
      if (!title || !href) return null;
      const period = formatPeriod(asString(content.startDate), asString(content.endDate));
      const locCount = asNumber(content.locationCount);
      const locMeta =
        locCount && locCount > 0
          ? `${locCount} ${locCount === 1 ? "location" : "locations"}`
          : null;
      return {
        ...base,
        kind: "cert.create",
        href,
        title,
        summary: asString(content.shortDescription),
        meta: [period, locMeta].filter(Boolean).join(" · ") || null,
        imageUrl: resolveMediaUrl(actor.did, content.image),
      };
    }

    case "collection.create":
    case "project.created_with_cert": {
      const title = asString(content.title);
      const href = hrefForAtUri(uri);
      if (!title || !href) return null;
      const itemCount = asNumber(content.itemCount);
      const meta =
        itemCount && itemCount > 0
          ? `${itemCount} ${itemCount === 1 ? "activity" : "activities"}`
          : null;
      return {
        ...base,
        kind,
        href,
        title,
        summary: asString(content.shortDescription),
        meta,
        imageUrl: resolveMediaUrl(actor.did, content.image),
      };
    }

    case "update.create": {
      const targetUri = extractTargetUri(content);
      return {
        ...base,
        kind: "update.create",
        title: asString(content.title),
        summary: asString(content.shortDescription),
        imageUrl: resolveMediaUrl(actor.did, content.image),
        target: targetUri ? (targetLinks.get(targetUri) ?? null) : null,
      };
    }

    case "evaluation.create": {
      const targetUri = extractTargetUri(content);
      return {
        ...base,
        kind: "evaluation.create",
        summary: asString(content.summary),
        target: targetUri ? (targetLinks.get(targetUri) ?? null) : null,
      };
    }

    case "measurement.create": {
      const targetUri = extractTargetUri(content);
      return {
        ...base,
        kind: "measurement.create",
        metric: asString(content.metric),
        target: targetUri ? (targetLinks.get(targetUri) ?? null) : null,
      };
    }

    case "endorsement.award": {
      const subject = toActor(asRecord(content.subject), handles);
      if (!subject) return null;
      return {
        ...base,
        kind: "endorsement.award",
        subject,
      };
    }

    default:
      return {
        ...base,
        kind: "unknown",
        rawKind: kind,
      };
  }
}

export type NetworkFeedQuery = {
  viewerDid: string;
  trustedEvaluators?: readonly string[];
  organizationQuality?: {
    allowed: readonly OrgQualityTier[];
    includeUnrated: boolean;
  };
  kinds?: readonly FeedEventKind[];
  limit?: number;
  cursor?: string;
};

/**
 * Loads one page of the Hypercerts viewer-scope network feed from the Feed/Views
 * service and enriches actor handles and target record titles in parallel.
 */
export async function getNetworkFeed(query: NetworkFeedQuery): Promise<Page<NetworkFeedEntry>> {
  const orgQuality = query.organizationQuality ?? DEFAULT_ORG_QUALITY;
  const evaluators = (query.trustedEvaluators ?? []).filter(isDid);
  const params: Record<string, unknown> = {
    $type: HYPERCERTS_FEED_PARAMS_TYPE,
    viewerDid: query.viewerDid,
    ...(evaluators.length > 0 ? { trustedEvaluators: evaluators } : {}),
    organizationQuality: {
      allowed: [...orgQuality.allowed],
      includeUnrated: orgQuality.includeUnrated,
    },
    ...(query.kinds && query.kinds.length > 0 ? { kinds: [...query.kinds] } : {}),
  };

  const { feed, cursor } = await callFeed(HYPERCERTS_FEED_ID, params, {
    limit: query.limit ?? DEFAULT_FEED_LIMIT,
    cursor: query.cursor,
  });

  const { dids, targetUris } = collectDidsAndTargets(feed);
  const [handlePairs, targetLinks] = await Promise.all([
    Promise.all(dids.map(async (did) => [did, await getHandle(did)] as const)),
    resolveTargetLinks(targetUris),
  ]);
  const handles = new Map<string, string | null>(handlePairs);

  const items: NetworkFeedEntry[] = [];
  for (const entry of feed) {
    const mapped = mapWireEntry(entry, handles, targetLinks);
    if (mapped) items.push(mapped);
  }
  return { items, cursor };
}

async function cachedTrustedEvaluators(): Promise<ActorCard[]> {
  "use cache";
  cacheLife("public");
  const listUri = `at://${TRUSTED_EVALUATORS_DID}/org.hypercerts.collection/${TRUSTED_EVALUATORS_RKEY}`;
  cacheTag(tags.list(listUri));

  const list = await getList(TRUSTED_EVALUATORS_DID, TRUSTED_EVALUATORS_RKEY);
  if (!list) return [];
  const seen = new Set<string>();
  const dids: string[] = [];
  for (const uri of list.itemUris) {
    const did = uri.split("/")[2];
    if (did && isDid(did) && !seen.has(did)) {
      seen.add(did);
      dids.push(did);
    }
  }
  if (dids.length === 0) return [];
  for (const did of dids) cacheTag(tags.actor(did));
  return await getActorCards(dids);
}

/**
 * Curated list of default trusted endorsers (`list:accounts`), cached publicly.
 * Errors throw out of `"use cache"` (never cached) and degrade to `[]` here so
 * the feed still works with direct follows.
 */
export async function getTrustedEvaluators(): Promise<ActorCard[]> {
  try {
    return await cachedTrustedEvaluators();
  } catch (err) {
    logError("[feed] trusted evaluators load failed", err);
    return [];
  }
}
