// Shared types, filter presets, and render-time endorsement grouping for the
// network feed (`/feed`), backed by the Hypercerts Feed / Views service
// (`src/lib/views-service.ts`). Plain data only — safe in both Server and
// Client Components.

import type { ActorCard, FeedLink } from "@/lib/hypercerts/views";

export const FEED_EVENT_KINDS = [
  "cert.create",
  "collection.create",
  "project.created_with_cert",
  "update.create",
  "evaluation.create",
  "measurement.create",
  "endorsement.award",
] as const;

export type FeedEventKind = (typeof FEED_EVENT_KINDS)[number];

export const ORG_QUALITY_TIERS = ["high-quality", "standard", "draft", "likely-test"] as const;

export type OrgQualityTier = (typeof ORG_QUALITY_TIERS)[number];

export const ORG_QUALITY_LABELS: Record<OrgQualityTier, string> = {
  "high-quality": "High quality",
  standard: "Standard",
  draft: "Draft",
  "likely-test": "Likely test",
};

/** Default organization-quality policy: hide draft and likely-test, include unrated. */
export const DEFAULT_ORG_QUALITY: {
  allowed: readonly OrgQualityTier[];
  includeUnrated: boolean;
} = {
  allowed: ["high-quality", "standard"],
  includeUnrated: true,
};

/** Content-filter chips mapping user-facing categories to feed service `kinds`. */
export const FEED_KIND_GROUPS = [
  {
    id: "activities",
    label: "Activities",
    kinds: ["cert.create", "project.created_with_cert"] as readonly FeedEventKind[],
  },
  {
    id: "projects",
    label: "Projects",
    kinds: ["collection.create", "project.created_with_cert"] as readonly FeedEventKind[],
  },
  {
    id: "updates",
    label: "Updates",
    kinds: ["update.create"] as readonly FeedEventKind[],
  },
  {
    id: "evaluations",
    label: "Evaluations",
    kinds: ["evaluation.create"] as readonly FeedEventKind[],
  },
  {
    id: "measurements",
    label: "Measurements",
    kinds: ["measurement.create"] as readonly FeedEventKind[],
  },
  {
    id: "endorsements",
    label: "Endorsements",
    kinds: ["endorsement.award"] as readonly FeedEventKind[],
  },
] as const;

export type FeedKindGroupId = (typeof FEED_KIND_GROUPS)[number]["id"];

export type NetworkFeedEntryBase = {
  /** Source record AT-URI — stable key for pagination deduplication. */
  uri: string;
  actor: ActorCard;
  /** Formatted display date ("Jun 30, 2026"), or null if absent. */
  date: string | null;
  /** Raw ISO timestamp for `<time dateTime>`. */
  createdAt: string | null;
};

export type NetworkFeedEntry =
  | (NetworkFeedEntryBase & {
      kind: "cert.create";
      href: string;
      title: string;
      summary: string | null;
      meta: string | null;
      imageUrl: string | null;
    })
  | (NetworkFeedEntryBase & {
      kind: "collection.create" | "project.created_with_cert";
      href: string;
      title: string;
      summary: string | null;
      meta: string | null;
      imageUrl: string | null;
    })
  | (NetworkFeedEntryBase & {
      kind: "update.create";
      title: string | null;
      summary: string | null;
      imageUrl: string | null;
      target: FeedLink | null;
    })
  | (NetworkFeedEntryBase & {
      kind: "evaluation.create";
      summary: string | null;
      target: FeedLink | null;
    })
  | (NetworkFeedEntryBase & {
      kind: "measurement.create";
      metric: string | null;
      target: FeedLink | null;
    })
  | (NetworkFeedEntryBase & {
      kind: "endorsement.award";
      subject: ActorCard;
    })
  | (NetworkFeedEntryBase & {
      kind: "unknown";
      rawKind: string;
    });

export type GroupedFeedItem =
  | { type: "entry"; key: string; entry: NetworkFeedEntry }
  | {
      type: "endorsementGroup";
      key: string;
      actor: ActorCard;
      date: string | null;
      createdAt: string | null;
      subjects: ActorCard[];
    };

/**
 * Collapses consecutive `endorsement.award` entries by the same actor into one
 * grouped item ("X endorsed A, B and 3 others"), preserving chronological order
 * and deduplicating repeated subject DIDs within a run.
 */
export function groupNetworkFeed(entries: readonly NetworkFeedEntry[]): GroupedFeedItem[] {
  const out: GroupedFeedItem[] = [];
  for (const entry of entries) {
    if (entry.kind !== "endorsement.award") {
      out.push({ type: "entry", key: entry.uri, entry });
      continue;
    }

    const last = out[out.length - 1];
    if (last?.type === "endorsementGroup" && last.actor.did === entry.actor.did) {
      if (!last.subjects.some((s) => s.did === entry.subject.did)) {
        last.subjects.push(entry.subject);
      }
      continue;
    }

    if (
      last?.type === "entry" &&
      last.entry.kind === "endorsement.award" &&
      last.entry.actor.did === entry.actor.did
    ) {
      const subjects = [last.entry.subject];
      if (!subjects.some((s) => s.did === entry.subject.did)) {
        subjects.push(entry.subject);
      }
      out[out.length - 1] = {
        type: "endorsementGroup",
        key: last.key,
        actor: last.entry.actor,
        date: last.entry.date,
        createdAt: last.entry.createdAt,
        subjects,
      };
      continue;
    }

    out.push({ type: "entry", key: entry.uri, entry });
  }
  return out;
}
