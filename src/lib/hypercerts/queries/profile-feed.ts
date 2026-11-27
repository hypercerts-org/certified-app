// Merged chronological profile activity feed across all indexed record types.
import "server-only";

import { app, org } from "@hypercerts-org/api";
import { tags } from "../cache";
import {
  type ActivityCard,
  type ActorCard,
  awardSubject,
  didOf,
  type FeedEvent,
  type FeedRow,
  type FeedTarget,
  formatDate,
  formatMoney,
  type Page,
  type ProjectCard,
  toActivityCard,
  toActorCard,
  toBadgeCard,
  toEndorsementCard,
  toProjectCard,
  toReceipt,
  toWalletTarget,
} from "../views";
import { getActorCards } from "./actors";
import {
  type AtUri,
  api,
  type BadgeAwardView,
  chunks,
  collectionOf,
  type Did,
  publicData,
  read,
  withHandles,
} from "./client";

// Profile feed
//
// What an account did, newest first, merged from what the API lists by
// author or subject: activities and projects it published, endorsements
// given and received, badges received and awarded, follows, gifts. Each kind
// is read a page at a time, newest first, and the pages are merged by date;
// the cursor keeps where each kind stopped, so Load more continues every kind
// in order and nothing older shows before something newer that wasn't read.

const FEED_SOURCES = [
  "activities",
  "projects",
  "awardsGiven",
  "awardsReceived",
  "followers",
  "following",
  "projectsFollowed",
  "giftsReceived",
  "giftsGiven",
  "giftsRecorded",
] as const;
type FeedSource = (typeof FEED_SOURCES)[number];

/** Records read per kind per request. */
const FEED_SOURCE_PAGE = 25;
/** Events per page of the feed, before grouping. */
const FEED_EVENTS = 40;

const timeOf = (value: unknown) => {
  const time = typeof value === "string" ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
};

const isEndorsement = (award: BadgeAwardView) => award.badge?.record.badgeType === "endorsement";

const badgeLink = (award: BadgeAwardView) => {
  const uri = award.badge?.uri ?? "";
  return {
    title: String(award.badge?.record.title ?? "").trim() || "A badge",
    href: `/${didOf(uri)}/badge/${uri.split("/").pop()}`,
  };
};

/** One page of one kind of event, newest first. */
async function feedSourcePage(
  source: FeedSource,
  did: string,
  cursor: string | undefined,
): Promise<{ events: FeedEvent[]; cursor: string | null }> {
  "use cache";
  publicData(tags.actor(did));

  const limit = FEED_SOURCE_PAGE;
  const author = [did as Did];
  switch (source) {
    case "activities": {
      const out = await api.call(
        org.hypercerts.claim.listActivities,
        { authors: author, limit, cursor },
        read(),
      );
      return {
        events: out.activities.map((view) => ({
          kind: "activity",
          key: view.uri,
          time: timeOf(view.record.createdAt),
          activity: toActivityCard(view),
        })),
        cursor: out.cursor ?? null,
      };
    }
    case "projects": {
      const out = await api.call(
        org.hypercerts.collection.listCollections,
        { authors: author, types: ["project"], limit, cursor },
        read(),
      );
      return {
        events: out.collections.map((view) => ({
          kind: "project",
          key: view.uri,
          time: timeOf(view.record.createdAt),
          project: toProjectCard(view),
        })),
        cursor: out.cursor ?? null,
      };
    }
    case "awardsGiven": {
      const out = await api.call(
        app.certified.badge.listBadgeAwards,
        { authors: author, limit, cursor },
        read(),
      );
      return {
        events: out.badgeAwards.map((award): FeedEvent => {
          const base = { key: award.uri, time: timeOf(award.record.createdAt) };
          const subject = awardSubject(award.record.subject);
          if (isEndorsement(award)) {
            const card = toEndorsementCard(award);
            return { ...base, kind: "endorsed", subject, badge: card.badge, note: card.note };
          }
          return { ...base, kind: "awarded", badge: badgeLink(award), recipient: subject };
        }),
        cursor: out.cursor ?? null,
      };
    }
    case "awardsReceived": {
      const out = await api.call(
        app.certified.badge.listBadgeAwards,
        { subjects: [did], responses: ["accepted", "unanswered"], limit, cursor },
        read(),
      );
      const now = Date.now();
      return {
        events: out.badgeAwards.flatMap((award): FeedEvent[] => {
          const base = { key: award.uri, time: timeOf(award.record.createdAt) };
          if (isEndorsement(award)) {
            const card = toEndorsementCard(award);
            return [
              {
                ...base,
                kind: "endorsedBy",
                issuer: card.issuer,
                badge: card.badge,
                note: card.note,
              },
            ];
          }
          // A badge is the account's once it accepts it.
          const badge = award.responseStatus === "accepted" ? toBadgeCard(award, now) : null;
          return badge ? [{ ...base, kind: "badge", badge }] : [];
        }),
        cursor: out.cursor ?? null,
      };
    }
    case "followers":
    case "following": {
      const params = { actor: did as Did, limit, cursor };
      const out =
        source === "followers"
          ? await api
              .call(app.certified.graph.listActorFollowers, params, read())
              .then((page) => ({ views: page.followers, cursor: page.cursor }))
          : await api
              .call(app.certified.graph.listActorFollowing, params, read())
              .then((page) => ({ views: page.following, cursor: page.cursor }));
      return {
        events: out.views.map((view) => ({
          kind: source === "followers" ? "follower" : "followed",
          key: view.follow.uri,
          time: timeOf(view.follow.record.createdAt),
          actor: toActorCard({
            did: view.did,
            profile: view.profile,
            organization: view.organization,
          }),
        })),
        cursor: out.cursor ?? null,
      };
    }
    case "projectsFollowed": {
      const out = await api.call(
        app.certified.graph.listEntityFollowing,
        { actor: did as Did, limit, cursor },
        read(),
      );
      return {
        events: out.entities.flatMap((item): FeedEvent[] => {
          // Null when the followed project is gone (deleted, or not indexed): skip it.
          const entity = item.entity as ({ $type?: string } & CollectionViewLike) | null;
          if (entity?.$type !== "org.hypercerts.collection.getCollection#collectionView") {
            return [];
          }
          const project = toProjectCard(entity as Parameters<typeof toProjectCard>[0]);
          return [
            {
              kind: "followedProject",
              key: item.follow.uri,
              time: timeOf(item.follow.record.createdAt),
              project: {
                title: project.title,
                href: `/${project.authorDid}/project/${project.rkey}`,
              },
            },
          ];
        }),
        cursor: out.cursor ?? null,
      };
    }
    case "giftsReceived":
    case "giftsGiven":
    case "giftsRecorded": {
      const filter =
        source === "giftsReceived"
          ? { to: [did] }
          : source === "giftsGiven"
            ? { from: [did] }
            : { authors: author };
      const out = await api.call(
        org.hypercerts.funding.listReceipts,
        { ...filter, limit, cursor },
        read(),
      );
      const direction =
        source === "giftsReceived" ? "received" : source === "giftsGiven" ? "given" : "recorded";
      return {
        events: out.receipts.map((view) => giftEvent(view, direction)),
        cursor: out.cursor ?? null,
      };
    }
  }
}
type CollectionViewLike = Record<string, unknown>;

type ReceiptView = org.hypercerts.funding.listReceipts.$OutputBody["receipts"][number];

/**
 * A receipt as a feed event: for gifts received, it names the donor; for
 * gifts given or recorded, what it was for (else the receiving account, else
 * the bare address it went to).
 */
export function giftEvent(
  view: ReceiptView,
  direction: "received" | "given" | "recorded",
): Extract<FeedEvent, { kind: "gift" }> {
  const receipt = toReceipt(view);
  const from = receipt.from;
  const to = receipt.to;
  const counterpart =
    direction === "received"
      ? from.kind === "account"
        ? from.did
        : null
      : (receipt.forUri ?? (to.kind === "account" ? to.did : null));
  return {
    kind: "gift",
    key: view.uri,
    time: timeOf(view.record.createdAt),
    direction,
    value: receipt.value,
    currency: receipt.currency,
    donor: from.kind === "account" ? from.did : from.kind === "text" ? from.value : null,
    counterpart,
    // Given or recorded to a bare address: the address is what there is to name.
    wallet:
      direction !== "received" && !counterpart && to.kind === "text"
        ? toWalletTarget(to.value, asNetwork(view.record.paymentNetwork))
        : null,
  };
}

/** Where each kind stopped: the page it is reading (null: the first) and how far into it. */
type FeedState = Partial<Record<FeedSource, { c: string | null; o: number } | "done">>;

const encodeFeedCursor = (state: FeedState) =>
  Buffer.from(JSON.stringify(state)).toString("base64url");

function decodeFeedCursor(cursor: string | undefined): FeedState | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as FeedState;
  } catch {
    return null;
  }
}

const asNetwork = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function coveredByProject(activity: ActivityCard, projects: ProjectCard[]): boolean {
  return projects.some(
    (project) =>
      sameTitle(project.title, activity.title) && project.activityUris.includes(activity.uri),
  );
}

/** A page of an account's feed: rows, newest first, and where the next page starts. */
export async function getProfileFeed(did: string, cursor?: string): Promise<Page<FeedRow>> {
  "use cache";
  publicData(tags.actor(did));

  const state: FeedState =
    decodeFeedCursor(cursor) ??
    Object.fromEntries(FEED_SOURCES.map((source) => [source, { c: null, o: 0 }]));
  const pages = new Map<FeedSource, { events: FeedEvent[]; cursor: string | null }>();
  const load = async (source: FeedSource) => {
    const at = state[source];
    if (!at || at === "done") return;
    pages.set(source, await feedSourcePage(source, did, at.c ?? undefined));
  };
  await Promise.all(FEED_SOURCES.map(load));

  // The next event of a kind, reading its next page when this one is used up.
  const next = async (source: FeedSource): Promise<FeedEvent | null> => {
    const at = state[source];
    const page = pages.get(source);
    if (!at || at === "done" || !page) return null;
    if (at.o < page.events.length) return page.events[at.o];
    if (!page.cursor) {
      state[source] = "done";
      return null;
    }
    state[source] = { c: page.cursor, o: 0 };
    await load(source);
    return next(source);
  };

  const taken: FeedEvent[] = [];
  while (taken.length < FEED_EVENTS) {
    const heads = await Promise.all(
      FEED_SOURCES.map(async (source) => ({ source, event: await next(source) })),
    );
    let newest: { source: FeedSource; event: FeedEvent } | null = null;
    for (const head of heads) {
      if (head.event && (!newest || head.event.time > newest.event.time)) {
        newest = { source: head.source, event: head.event };
      }
    }
    if (!newest) break;
    taken.push(newest.event);
    const at = state[newest.source];
    if (at && at !== "done") at.o += 1;
  }
  // A kind whose page is used up and has no next one is done.
  await Promise.all(FEED_SOURCES.map(next));
  const more = FEED_SOURCES.some((source) => state[source] && state[source] !== "done");

  // Cards for the accounts the events name by DID.
  const dids = new Set<string>();
  const recordUris = new Set<string>();
  for (const event of taken) {
    if (event.kind === "endorsed" && event.subject?.startsWith("did:")) dids.add(event.subject);
    if (event.kind === "awarded" && event.recipient?.startsWith("did:")) dids.add(event.recipient);
    if (event.kind === "gift" && event.counterpart) {
      if (event.counterpart.startsWith("did:")) dids.add(event.counterpart);
      else recordUris.add(event.counterpart);
    }
  }
  const [cards, records] = await Promise.all([
    getActorCards([...dids]).then((list) => new Map(list.map((card) => [card.did, card]))),
    feedRecords([...recordUris]),
  ]);

  // An activity its own same-titled project holds: the project's row stands
  // for both (an organization often makes one of each for the same work).
  const projects = taken.flatMap((event) => (event.kind === "project" ? [event.project] : []));
  const shown = taken.filter(
    (event) => event.kind !== "activity" || !coveredByProject(event.activity, projects),
  );

  return {
    items: await withFeedHandles(groupFeed(shown, cards, records)),
    cursor: more ? encodeFeedCursor(state) : null,
  };
}

/**
 * The projects and activities gifts were for, by URI: their titles, pages and
 * pictures, read a hundred at a time.
 */
async function feedRecords(uris: string[]): Promise<Map<string, FeedTarget>> {
  const out = new Map<string, FeedTarget>();
  const projects = uris.filter((uri) => collectionOf(uri) === "org.hypercerts.collection");
  const activities = uris.filter((uri) => collectionOf(uri) === "org.hypercerts.claim.activity");
  await Promise.all([
    ...chunks(projects).map(async (batch) => {
      const page = await api.call(
        org.hypercerts.collection.listCollections,
        { uris: batch as AtUri[], limit: 100 },
        read(),
      );
      for (const view of page.collections) {
        const project = toProjectCard(view);
        out.set(view.uri, {
          kind: "record",
          uri: view.uri,
          title: project.title,
          href: `/${project.authorDid}/project/${project.rkey}`,
          imageUrl: project.imageUrl,
        });
      }
    }),
    ...chunks(activities).map(async (batch) => {
      const page = await api.call(
        org.hypercerts.claim.listActivities,
        { uris: batch as AtUri[], limit: 100 },
        read(),
      );
      for (const view of page.activities) {
        const activity = toActivityCard(view);
        out.set(view.uri, {
          kind: "record",
          uri: view.uri,
          title: activity.title,
          href: `/${didOf(view.uri)}/activity/${view.uri.split("/").pop()}`,
          imageUrl: activity.imageUrl,
        });
      }
    }),
  ]);
  return out;
}

/** How many accounts a grouped row names; the rest it counts. */
const GROUP_NAMED = 3;

/**
 * Rows from events, newest first: gifts, followers, follows and badges
 * awarded come together per day (and per badge), at their newest's place.
 */
export function groupFeed(
  events: FeedEvent[],
  cards: Map<string, ActorCard>,
  records: Map<string, FeedTarget>,
): FeedRow[] {
  const rows: FeedRow[] = [];
  const groups = new Map<string, FeedRow>();
  const sums = new Map<string, Map<string, number>>();
  const donors = new Map<string, Set<string>>();
  const targetKeys = new Map<string, Set<string>>();
  for (const event of events) {
    const date = formatDate(new Date(event.time).toISOString());
    const day = dayOf(event.time);
    switch (event.kind) {
      case "activity":
      case "project":
      case "badge":
        rows.push({ ...event, date } as FeedRow);
        break;
      case "endorsedBy":
        rows.push({ ...event, date });
        break;
      case "endorsed": {
        const id = `endorsed:${day}:${event.badge ?? ""}`;
        const row = groups.get(id);
        const subject = event.subject ? cards.get(event.subject) : undefined;
        if (row?.kind === "endorsed") {
          row.count += 1;
          row.note = null;
          if (subject && row.subjects.length < GROUP_NAMED) row.subjects.push(subject);
        } else {
          const created: FeedRow = {
            key: event.key,
            date,
            kind: "endorsed",
            subjects: subject ? [subject] : [],
            count: 1,
            badge: event.badge,
            note: event.note,
          };
          groups.set(id, created);
          rows.push(created);
        }
        break;
      }
      case "awarded": {
        const id = `awarded:${day}:${event.badge.href}`;
        const row = groups.get(id);
        const recipient = event.recipient ? cards.get(event.recipient) : undefined;
        if (row?.kind === "awarded") {
          row.count += 1;
          if (recipient && row.recipients.length < GROUP_NAMED) row.recipients.push(recipient);
        } else {
          const created: FeedRow = {
            key: event.key,
            date,
            kind: "awarded",
            badge: event.badge,
            count: 1,
            recipients: recipient ? [recipient] : [],
          };
          groups.set(id, created);
          rows.push(created);
        }
        break;
      }
      case "follower":
      case "followed": {
        const kind = event.kind === "follower" ? "followers" : "following";
        const id = `${kind}:${day}`;
        const row = groups.get(id);
        if (row && (row.kind === "followers" || row.kind === "following")) {
          row.count += 1;
          if (row.actors.length < GROUP_NAMED) row.actors.push(event.actor);
        } else {
          const created: FeedRow = { key: event.key, date, kind, count: 1, actors: [event.actor] };
          groups.set(id, created);
          rows.push(created);
        }
        break;
      }
      case "followedProject": {
        const id = `projectsFollowed:${day}`;
        const row = groups.get(id);
        if (row?.kind === "projectsFollowed") {
          row.count += 1;
          if (row.projects.length < GROUP_NAMED) row.projects.push(event.project);
        } else {
          const created: FeedRow = {
            key: event.key,
            date,
            kind: "projectsFollowed",
            count: 1,
            projects: [event.project],
          };
          groups.set(id, created);
          rows.push(created);
        }
        break;
      }
      case "gift": {
        const id = `gifts:${event.direction}:${day}`;
        let row = groups.get(id);
        if (row?.kind !== "gifts") {
          row = {
            key: event.key,
            date,
            kind: "gifts",
            direction: event.direction,
            count: 0,
            totals: [],
            donors: 0,
            targets: [],
            targetCount: 0,
          };
          groups.set(id, row);
          sums.set(id, new Map());
          donors.set(id, new Set());
          rows.push(row);
        }
        row.count += 1;
        if (event.value !== null && Number.isFinite(event.value) && event.currency) {
          const sum = sums.get(id);
          sum?.set(event.currency, (sum.get(event.currency) ?? 0) + event.value);
        }
        if (event.donor) donors.get(id)?.add(event.donor);
        row.donors = donors.get(id)?.size ?? 0;
        // What the gift went to (or came from), each once.
        const target: FeedTarget | undefined = event.counterpart
          ? event.counterpart.startsWith("did:")
            ? (() => {
                const actor = cards.get(event.counterpart);
                return actor ? { kind: "account" as const, actor } : undefined;
              })()
            : records.get(event.counterpart)
          : undefined;
        const seen = targetKeys.get(id) ?? new Set<string>();
        targetKeys.set(id, seen);
        const named = target ?? event.wallet ?? undefined;
        const key =
          event.counterpart ?? (event.wallet?.kind === "wallet" ? event.wallet.address : null);
        if (key && !seen.has(key)) {
          seen.add(key);
          row.targetCount += 1;
          if (named && row.targets.length < GROUP_NAMED) row.targets.push(named);
        }
        row.totals = [...(sums.get(id) ?? new Map<string, number>()).entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([currency, sum]) => ({ currency, amount: formatMoney(String(sum), currency) }));
        break;
      }
    }
  }
  return rows;
}

/** The rows' accounts with their verified handles, for links. */
export async function withFeedHandles(rows: FeedRow[]): Promise<FeedRow[]> {
  const all = rows.flatMap((row): ActorCard[] => {
    if (row.kind === "endorsed") return row.subjects;
    if (row.kind === "endorsedBy") return [row.issuer];
    if (row.kind === "awarded") return row.recipients;
    if (row.kind === "followers" || row.kind === "following") return row.actors;
    if (row.kind === "gifts") {
      return row.targets.flatMap((target) => (target.kind === "account" ? [target.actor] : []));
    }
    return [];
  });
  const named = new Map((await withHandles(all)).map((card) => [card.did, card]));
  const card = (actor: ActorCard) => named.get(actor.did) ?? actor;
  return rows.map((row) => {
    if (row.kind === "endorsed") return { ...row, subjects: row.subjects.map(card) };
    if (row.kind === "endorsedBy") return { ...row, issuer: card(row.issuer) };
    if (row.kind === "awarded") return { ...row, recipients: row.recipients.map(card) };
    if (row.kind === "followers" || row.kind === "following") {
      return { ...row, actors: row.actors.map(card) };
    }
    if (row.kind === "gifts") {
      return {
        ...row,
        targets: row.targets.map((target) =>
          target.kind === "account" ? { ...target, actor: card(target.actor) } : target,
        ),
      };
    }
    return row;
  });
}
