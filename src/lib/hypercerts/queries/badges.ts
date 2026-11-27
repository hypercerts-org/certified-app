// Badge definition, award, and holder read queries.
import "server-only";

import { app, org } from "@hypercerts-org/api";
import { cacheTag } from "next/cache";
import { tags } from "../cache";
import {
  type ActorCard,
  awardSubject,
  type BadgeCard,
  type BadgeDetail,
  ENDORSEMENT_BADGE_TYPE,
  type ListItem,
  type Page,
  type PersonRow,
  PLAIN_ENDORSEMENT,
  type ProjectCard,
  sortBadges,
  toBadgeCard,
  toBadgeDetail,
  toEndorsementCard,
  toProjectCard,
} from "../views";
import { actorCards } from "./actors";
import {
  type AtUri,
  activityHrefOf,
  api,
  type BadgeAwardView,
  chunks,
  type Did,
  notFound,
  PEOPLE_PAGE,
  projectHrefOf,
  publicData,
  read,
  withHandles,
  withHandlesIn,
} from "./client";
import { resolveListItems } from "./lists";

// Badges
//
// Every badge awarded to an account, apart from the ones a profile shows as
// endorsements (views.ts, toBadgeCard): accepted by the recipient, or still
// awaiting its response. Rejected ones never show.

/** Pages of awards read per response, a hundred each. */
const BADGE_PAGES = 3;

export type Badges = {
  accepted: BadgeCard[];
  awaiting: BadgeCard[];
  /** Whether either list stopped at BADGE_PAGES with more to read. */
  more: boolean;
};

async function badgeAwards(did: string, response: "accepted" | "unanswered" | "rejected") {
  const awards: BadgeAwardView[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < BADGE_PAGES; page++) {
    const out = await api.call(
      app.certified.badge.listBadgeAwards,
      { subjects: [did], responses: [response], limit: 100, cursor },
      read(),
    );
    awards.push(...out.badgeAwards);
    cursor = out.cursor;
    if (!cursor) return { awards, more: false };
  }
  return { awards, more: true };
}

/** The badges awarded to `did`, each list in force first, then newest; expired last. */
export async function getBadges(did: string): Promise<Badges> {
  "use cache";
  publicData(tags.badges(did));

  const [accepted, awaiting] = await Promise.all([
    badgeAwards(did, "accepted"),
    badgeAwards(did, "unanswered"),
  ]);
  const cards = async (awards: BadgeAwardView[]) =>
    sortBadges(
      await withHandlesIn(
        awards.flatMap((award) => toBadgeCard(award) ?? []),
        "issuer",
      ),
    );
  return {
    accepted: await cards(accepted.awards),
    awaiting: await cards(awaiting.awards),
    more: accepted.more || awaiting.more,
  };
}

/**
 * The badges `did` rejected: for its workspace only, where they can be
 * accepted again. A profile never shows them.
 */
export async function getRejectedBadges(did: string): Promise<BadgeCard[]> {
  "use cache";
  publicData(tags.badges(did));

  const { awards } = await badgeAwards(did, "rejected");
  return sortBadges(
    await withHandlesIn(
      awards.flatMap((award) => toBadgeCard(award, Date.now(), { withRejected: true }) ?? []),
      "issuer",
    ),
  );
}

/** The badges awarded to record `uri` (a project, an activity), not rejected: in force first, then newest. */
export async function getRecordBadges(uri: string): Promise<BadgeCard[]> {
  "use cache";
  publicData(tags.badges(uri));

  const { badgeAwards } = await api.call(
    app.certified.badge.listBadgeAwards,
    { subjects: [uri], responses: ["accepted", "unanswered"], limit: 100 },
    read(),
  );
  return sortBadges(
    await withHandlesIn(
      badgeAwards.flatMap((award) => toBadgeCard(award) ?? []),
      "issuer",
    ),
  );
}

/** A badge awarded to one of an account's projects, with that project. */
export type ProjectBadge = BadgeCard & { project: ProjectCard };

/** Pages of an account's projects read for their badges, a hundred each. */
const PROJECT_BADGE_PAGES = 3;

/**
 * The badges awarded to `did`'s projects (not rejected), in force first, then
 * newest: its projects a hundred a call, then their awards a hundred
 * projects a call.
 */
export async function getProjectBadges(
  did: string,
): Promise<{ badges: ProjectBadge[]; more: boolean }> {
  "use cache";
  publicData(tags.badges(did));
  cacheTag(tags.projects(did));

  const projects = new Map<string, ProjectCard>();
  let cursor: string | undefined;
  let more = false;
  for (let page = 0; page < PROJECT_BADGE_PAGES; page++) {
    const out = await api.call(
      org.hypercerts.collection.listCollections,
      { authors: [did as Did], types: ["project"], limit: 100, cursor },
      read(),
    );
    for (const view of out.collections) projects.set(view.uri, toProjectCard(view));
    cursor = out.cursor;
    more = Boolean(cursor);
    if (!cursor) break;
  }
  const awards = (
    await Promise.all(
      chunks([...projects.keys()]).map(async (batch) => {
        const out = await api.call(
          app.certified.badge.listBadgeAwards,
          { subjects: batch, responses: ["accepted", "unanswered"], limit: 100 },
          read(),
        );
        if (out.cursor) more = true;
        return out.badgeAwards;
      }),
    )
  ).flat();
  const badges = awards.flatMap((award): ProjectBadge[] => {
    const card = toBadgeCard(award);
    const project = projects.get(awardSubject(award.record.subject) ?? "");
    return card && project ? [{ ...card, project }] : [];
  });
  return { badges: sortBadges(await withHandlesIn(badges, "issuer")), more };
}

/** Who a badge went to: an account, or a record (a project, an activity). */
export type BadgeRecipient =
  | { kind: "account"; actor: ActorCard }
  | { kind: "record"; title: string; href: string };

/** A badge an account awarded, with who it went to and their response. */
export type AwardedBadge = BadgeCard & { recipient: BadgeRecipient };

/**
 * The badges `did` awarded to others, newest first, whatever the recipient
 * answered (BadgeCard.status). Plain endorsements are left out: the
 * workspace's Endorsements list them. Each badge's page tag is on the entry
 * too, so a recipient's answer (which refreshes that tag) shows here.
 */
export async function getAwardedBadges(
  did: string,
): Promise<{ badges: AwardedBadge[]; more: boolean }> {
  "use cache";
  publicData(tags.badges(did));

  const awards: BadgeAwardView[] = [];
  let cursor: string | undefined;
  let more = false;
  for (let page = 0; page < BADGE_PAGES; page++) {
    const out = await api.call(
      app.certified.badge.listBadgeAwards,
      {
        authors: [did as Did],
        responses: ["unanswered", "accepted", "rejected"],
        limit: 100,
        cursor,
      },
      read(),
    );
    awards.push(...out.badgeAwards);
    cursor = out.cursor;
    more = Boolean(cursor);
    if (!cursor) break;
  }
  const cards = awards.flatMap((award) => {
    const card = toBadgeCard(award, Date.now(), { withRejected: true });
    const subject = awardSubject(award.record.subject);
    return card && subject ? [{ card, subject }] : [];
  });
  for (const { card } of cards) {
    cacheTag(tags.badge(`at://${card.ownerDid}/app.certified.badge.definition/${card.rkey}`));
  }
  const dids = [
    ...new Set(cards.flatMap(({ subject }) => (subject.startsWith("did:") ? subject : []))),
  ];
  const recordUris = [
    ...new Set(cards.flatMap(({ subject }) => (subject.startsWith("at://") ? subject : []))),
  ];
  const [actors, records] = await Promise.all([
    actorCards(dids),
    recordUris.length > 0 ? resolveListItems(recordUris) : [],
  ]);
  const recordsByUri = new Map(records.map((item) => [item.uri, item]));
  const recipientOf = (subject: string): BadgeRecipient | null => {
    const actor = actors.get(subject);
    if (actor) return { kind: "account", actor };
    const item = recordsByUri.get(subject);
    if (item?.kind === "project") {
      return { kind: "record", title: item.project.title, href: projectHrefOf(item.project) };
    }
    if (item?.kind === "activity") {
      return { kind: "record", title: item.activity.title, href: activityHrefOf(item.uri) };
    }
    return null;
  };
  const badges = cards.flatMap(({ card, subject }): AwardedBadge[] => {
    const recipient = recipientOf(subject);
    return recipient ? [{ ...card, recipient }] : [];
  });
  return { badges: badges.sort((a, b) => b.time - a.time), more };
}

/** A badge an account defined, with how many hold it. */
export type IssuedBadge = BadgeDetail & {
  /** Awards accepted or awaiting a response (not rejected). */
  holders: number;
};

/** How many issued badges a profile reads (one page of definitions). */
const ISSUED_PAGE = 100;

/**
 * The badges `did` defined, most held first, with their holders counted: one
 * call for the definitions, then one count per badge (totals only).
 */
export async function getIssuedBadges(
  did: string,
): Promise<{ badges: IssuedBadge[]; more: boolean }> {
  "use cache";
  publicData(tags.badges(did));

  const { badgeDefinitions, cursor } = await api.call(
    app.certified.badge.listBadgeDefinitions,
    { authors: [did as Did], limit: ISSUED_PAGE },
    read(),
  );
  const details = badgeDefinitions.flatMap((view) => toBadgeDetail(view) ?? []);
  const badges = await Promise.all(
    details.map(async (badge) => {
      const { totalCount } = await api.call(
        app.certified.badge.listBadgeAwards,
        {
          badgeUris: [badge.uri as AtUri],
          ...(badge.allowedIssuers.length > 0 && {
            authors: badge.allowedIssuers as Did[],
          }),
          responses: ["accepted", "unanswered"],
          limit: 1,
          includeTotal: true,
        },
        read(),
      );
      return { ...badge, holders: totalCount ?? 0 };
    }),
  );
  const [issuer] = details.length > 0 ? await withHandles([details[0].issuer]) : [];
  return {
    badges: badges
      .map((badge) => ({ ...badge, issuer: issuer ?? badge.issuer }))
      .sort((a, b) => b.holders - a.holders),
    more: Boolean(cursor),
  };
}

/**
 * The badges `did` created for awarding, as its workspace lists them: its
 * issued badges without its plain Endorsement, which Endorsements gives.
 */
export async function getYourBadges(did: string): Promise<IssuedBadge[]> {
  const { badges } = await getIssuedBadges(did);
  return badges.filter(
    (badge) =>
      !(badge.title === PLAIN_ENDORSEMENT && badge.type?.toLowerCase() === ENDORSEMENT_BADGE_TYPE),
  );
}

/**
 * A badge definition, or null when there is none at `uri`. Its issuer's card
 * comes as the API has it, without a handle (AuthorLink streams that in).
 */
export async function getBadge(uri: string): Promise<BadgeDetail | null> {
  "use cache";
  publicData(tags.badge(uri));

  const result = await api.xrpcSafe(app.certified.badge.getBadgeDefinition, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (result.success) {
    return toBadgeDetail(result.body.badgeDefinition);
  }
  if (notFound(result)) return null;
  throw result;
}

/** Whether badge definition `uri` is in the index. Never cached (waitForIndex). */
export async function badgeDefinitionIndexed(uri: string): Promise<boolean> {
  const result = await api.xrpcSafe(app.certified.badge.getBadgeDefinition, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  return result.success;
}

/** Whether badge award `uri` is in the index. Never cached (waitForIndex). */
export async function badgeAwardIndexed(uri: string): Promise<boolean> {
  const result = await api.xrpcSafe(app.certified.badge.getBadgeAward, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  return result.success;
}

/**
 * The indexed response status of badge award `uri` ("accepted", "rejected",
 * or "unanswered"), or null when the award isn't in the index. Never cached.
 */
export async function getIndexedBadgeAwardResponse(
  uri: string,
): Promise<"accepted" | "rejected" | "unanswered" | null> {
  const result = await api.xrpcSafe(app.certified.badge.getBadgeAward, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (!result.success) return null;
  const status = result.body.badgeAward.responseStatus;
  if (status === "accepted" || status === "rejected" || status === "unanswered") return status;
  return null;
}

/**
 * A badge's holder: an account (a person row, with the award's note), or a
 * record the badge went to, a project or an activity (as a list item,
 * resolveListItems), with the award's date.
 */
export type BadgeHolder =
  | { kind: "account"; uri: string; row: PersonRow }
  | {
      kind: "record";
      uri: string;
      item: Extract<ListItem, { kind: "project" | "activity" }>;
      date: string | null;
    };

/** One page of a badge's holders, newest award first. */
export type BadgeHolders = Page<BadgeHolder> & {
  /** Every award with this response, as the API counts them. */
  total: number;
};

/**
 * Who holds the badge at `uri`, by the recipient's response: accepted, or
 * still unanswered. Awards from issuers the definition doesn't allow are left
 * out (`allowedIssuers`, empty for anyone).
 */
export async function listBadgeHolders(
  uri: string,
  response: "accepted" | "unanswered",
  allowedIssuers: string[],
  cursor?: string,
): Promise<BadgeHolders> {
  "use cache";
  publicData(tags.badge(uri));

  const out = await api.call(
    app.certified.badge.listBadgeAwards,
    {
      badgeUris: [uri as AtUri],
      ...(allowedIssuers.length > 0 && { authors: allowedIssuers as Did[] }),
      responses: [response],
      limit: PEOPLE_PAGE,
      includeTotal: true,
      cursor,
    },
    read(),
  );
  const { badgeAwards, totalCount } = out;
  const awards = badgeAwards.filter(
    (award) => allowedIssuers.length === 0 || allowedIssuers.includes(award.author.did),
  );
  const subjects = awards.flatMap((award) => awardSubject(award.record.subject) ?? []);
  const dids = [...new Set(subjects.filter((subject) => subject.startsWith("did:")))];
  const recordUris = [...new Set(subjects.filter((subject) => subject.startsWith("at://")))];
  const [cards, records] = await Promise.all([
    actorCards(dids),
    recordUris.length > 0 ? resolveListItems(recordUris) : [],
  ]);
  const recordsByUri = new Map(records.map((item) => [item.uri, item]));
  const holders: BadgeHolder[] = [];
  for (const award of awards) {
    const subject = awardSubject(award.record.subject);
    if (!subject) continue;
    const { note, createdAt } = toEndorsementCard(award); // an award's note and date
    const actor = cards.get(subject);
    if (actor) {
      holders.push({
        kind: "account",
        uri: award.uri,
        row: { uri: award.uri, actor, note, date: createdAt },
      });
      continue;
    }
    const item = recordsByUri.get(subject);
    if (item?.kind === "project" || item?.kind === "activity") {
      holders.push({ kind: "record", uri: award.uri, item, date: createdAt });
    }
  }
  return {
    items: holders,
    cursor: out.cursor ?? null,
    total: totalCount ?? holders.length,
  };
}
