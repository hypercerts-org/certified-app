// Project and activity timeline queries (evaluations, measurements, attachments, badges).
import "server-only";

import { app, org } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { tags } from "../cache";
import {
  type ActivityCard,
  type ActorCard,
  type Attachment,
  awardSubject,
  type BadgeCard,
  didOf,
  type Evaluation,
  type FeedLink,
  type FeedRow,
  type Measurement,
  toActivityCard,
  toAttachment,
  toBadgeCard,
  toEvaluation,
  toMeasurement,
} from "../views";
import { getActorCards } from "./actors";
import {
  type AtUri,
  activityHrefOf,
  api,
  blobBases,
  chunks,
  collectionOf,
  publicData,
  read,
  withHandlesIn,
} from "./client";
import { giftEvent, groupFeed, withFeedHandles } from "./profile-feed";
import { getProject } from "./work";

// Evaluations, measurements and attachments (updates among them) name the
// records they are about; each kind is one call filtered by the record, so a
// page asks for its own and shows each section as it arrives. All public,
// cached with the record's context (tags.context).

/** An evaluation, with its evaluators' cards (those the API knows). */
export type EvaluationWithEvaluators = Evaluation & { evaluators: ActorCard[] };

/** Context records are read for up to this many records at once (the API's limit). */
const SUBJECTS = 100;

/** One record's URI, or several's (a project and its activities), as the API's subjects. */
function subjectsFor(uri: string | string[]): AtUri[] {
  const uris = (Array.isArray(uri) ? uri : [uri]).slice(0, SUBJECTS);
  for (const subject of uris) cacheTag(tags.context(subject));
  return uris as AtUri[];
}

/** The evaluations of record `uri` (or of several records), newest first. */
async function getEvaluations(uri: string | string[]): Promise<EvaluationWithEvaluators[]> {
  "use cache";
  cacheLife("public");

  const { evaluations } = await api.call(
    org.hypercerts.context.listEvaluations,
    { subjects: subjectsFor(uri), sortDirection: "desc", limit: 50 },
    read(),
  );
  const bases = await blobBases(evaluations.map((view) => view.did));
  const items = evaluations.map((view) => toEvaluation(view, bases.get(view.did) ?? null));
  const cards = new Map(
    (await getActorCards([...new Set(items.flatMap((item) => item.evaluatorDids))])).map((card) => [
      card.did,
      card,
    ]),
  );
  return items.map((item) => ({
    ...item,
    evaluators: item.evaluatorDids.flatMap((did) => cards.get(did) ?? []),
  }));
}

/** The measurements of record `uri` (or of several records), newest first. */
async function getMeasurements(uri: string | string[]): Promise<Measurement[]> {
  "use cache";
  cacheLife("public");

  const { measurements } = await api.call(
    org.hypercerts.context.listMeasurements,
    { subjects: subjectsFor(uri), sortDirection: "desc", limit: 50 },
    read(),
  );
  return withHandlesIn(
    measurements.map(toMeasurement).filter((m) => m.metric && m.value),
    "author",
  );
}

/**
 * Record `uri`'s attachments (or several records'): its updates (newest
 * first), and the rest. Comments are left out.
 */
async function getAttachments(
  uri: string | string[],
): Promise<{ updates: Attachment[]; files: Attachment[] }> {
  "use cache";
  cacheLife("public");

  const { attachments } = await api.call(
    org.hypercerts.context.listAttachments,
    { subjects: subjectsFor(uri), sortDirection: "desc", limit: 100 },
    read(),
  );
  const bases = await blobBases(attachments.map((view) => view.did));
  const items = await withHandlesIn(
    attachments.map((view) => toAttachment(view, bases.get(view.did) ?? null)),
    "author",
  );
  return {
    updates: items.filter((item) => item.kind === "update"),
    files: items.filter((item) => item.kind !== "update" && item.kind !== "comment"),
  };
}

// Timeline
//
// What happened in a project or an activity, newest first: a project's
// activities as they were published; what was added to the record (and to a
// project's activities): updates, other attachments, evaluations,
// measurements, badges; and the gifts it received, a day's together, as an
// account's feed groups them. Each kind is read once for the record and its
// activities together.

/** The activity a timeline item is about, when it isn't the project itself. */
export type TimelineOn = FeedLink | null;

export type TimelineItem = { key: string; time: number } & (
  | { kind: "activity"; activity: ActivityCard }
  | { kind: "update"; update: Attachment; on: TimelineOn }
  | { kind: "attachment"; attachment: Attachment; on: TimelineOn }
  | { kind: "evaluation"; evaluation: EvaluationWithEvaluators; on: TimelineOn }
  | { kind: "measurement"; measurement: Measurement; on: TimelineOn }
  | { kind: "badge"; badge: BadgeCard; on: TimelineOn }
  | { kind: "gifts"; row: Extract<FeedRow, { kind: "gifts" }> }
);

/** A project's or an activity's timeline, newest first. */
export async function getTimeline(uri: string): Promise<TimelineItem[]> {
  "use cache";
  publicData(tags.project(uri));
  cacheTag(tags.badges(uri));
  cacheTag(tags.activities(didOf(uri)));

  const isProject = collectionOf(uri) === "org.hypercerts.collection";
  const project = isProject ? await getProject(uri) : null;
  if (isProject && !project) return [];
  const activityUris = project?.activityUris ?? [];
  const subjects = [uri, ...activityUris].slice(0, SUBJECTS) as AtUri[];

  const [activityViews, evaluations, measurements, attachments, awards, receipts] =
    await Promise.all([
      Promise.all(
        chunks(activityUris).map(
          async (batch) =>
            (
              await api.call(
                org.hypercerts.claim.listActivities,
                { uris: batch as AtUri[], limit: 100 },
                read(),
              )
            ).activities,
        ),
      ).then((pages) => pages.flat()),
      getEvaluations(subjects),
      getMeasurements(subjects),
      getAttachments(subjects),
      api
        .call(
          app.certified.badge.listBadgeAwards,
          { subjects, responses: ["accepted", "unanswered"], limit: 100 },
          read(),
        )
        .then((out) => out.badgeAwards),
      api
        .call(org.hypercerts.funding.listReceipts, { forUris: [uri as AtUri], limit: 100 }, read())
        .then((out) => out.receipts),
    ]);
  cacheTag(tags.funding(uri));

  // Gifts as the account feed shows them: a day's in one post, naming donors.
  const gifts = receipts.map((view) => giftEvent(view, "received"));
  const donors = new Map(
    (
      await getActorCards([
        ...new Set(gifts.flatMap((gift) => (gift.counterpart ? [gift.counterpart] : []))),
      ])
    ).map((card) => [card.did, card]),
  );
  const giftTimes = new Map(gifts.map((gift) => [gift.key, gift.time]));
  const giftRows = (await withFeedHandles(groupFeed(gifts, donors, new Map()))).flatMap((row) =>
    row.kind === "gifts" ? [row] : [],
  );

  const activities = await withHandlesIn(activityViews.map(toActivityCard), "author");
  const activityLinks = new Map(
    activities.map((activity) => [
      activity.uri,
      { title: activity.title, href: activityHrefOf(activity.uri) },
    ]),
  );
  // The activity it is about, unless it is (also) about the project.
  const on = (about: string[]): TimelineOn =>
    about.includes(uri)
      ? null
      : (about.map((subject) => activityLinks.get(subject)).find(Boolean) ?? null);
  const created = new Map<string, number>(
    activityViews.map((view) => [
      view.uri,
      new Date(String(view.record.createdAt ?? "")).getTime(),
    ]),
  );

  const badges = await withHandlesIn(
    awards.flatMap((award) => {
      const card = toBadgeCard(award);
      const subject = awardSubject(award.record.subject);
      return card && subject ? [{ ...card, subject }] : [];
    }),
    "issuer",
  );

  const items: TimelineItem[] = [
    ...activities.map((activity) => ({
      kind: "activity" as const,
      key: activity.uri,
      time: created.get(activity.uri) || 0,
      activity,
    })),
    ...attachments.updates.map((update) => ({
      kind: "update" as const,
      key: update.uri,
      time: update.time,
      update,
      on: on(update.subjects),
    })),
    ...attachments.files.map((attachment) => ({
      kind: "attachment" as const,
      key: attachment.uri,
      time: attachment.time,
      attachment,
      on: on(attachment.subjects),
    })),
    ...evaluations.map((evaluation) => ({
      kind: "evaluation" as const,
      key: evaluation.uri,
      time: evaluation.time,
      evaluation,
      on: on(evaluation.subjects),
    })),
    ...measurements.map((measurement) => ({
      kind: "measurement" as const,
      key: measurement.uri,
      time: measurement.time,
      measurement,
      on: on(measurement.subjects),
    })),
    ...giftRows.map((row) => ({
      kind: "gifts" as const,
      key: row.key,
      time: giftTimes.get(row.key) ?? 0,
      row,
    })),
    ...badges.map(({ subject, ...badge }) => ({
      kind: "badge" as const,
      key: badge.uri,
      time: badge.time,
      badge,
      on: on([subject]),
    })),
  ];
  return items.sort((a, b) => b.time - a.time);
}
