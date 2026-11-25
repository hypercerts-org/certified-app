// What happened in a project or an activity, newest first, on its Overview,
// as the posts an account's feed shows (profile-feed, Post): a project's
// activities as they were published; the updates, attachments, evaluations, measurements and badges
// added to the record or to one of a project's activities; and the gifts it
// received, a day's in one post. The latest few
// show; the rest fold away.

import { CalendarClock } from "lucide-react";
import type { ReactNode } from "react";
import { badgeHref } from "@/components/cards";
import { Empty } from "@/components/empty";
import { IntentLink } from "@/components/intent-link";
import { FeedPost, Name, PageLink, Post } from "@/components/profile-feed";
import {
  AttachmentBody,
  EvaluationBody,
  EvaluatorNames,
  MeasurementBody,
  UpdateBody,
} from "@/components/record-context";
import { getTimeline, type TimelineItem, type TimelineOn } from "@/lib/hypercerts/queries";
import { type ActorCard, humanize } from "@/lib/hypercerts/views";

/** Posts shown before the rest fold away. */
const SHOWN = 10;

/** " on {activity}", when the post is about one of the project's activities. */
function On({ on }: { on: TimelineOn }) {
  if (!on) return null;
  return (
    <>
      {" on "}
      <PageLink link={on} />
    </>
  );
}

/** Kinds that don't read as a noun after "added a". */
const KIND_NOUN: Record<string, string> = { audio: "recording" };

/** "a report", "an audit", "a recording": what kind of attachment, with its article. */
function aKind(kind: string): string {
  const word = KIND_NOUN[kind] ?? humanize(kind).toLowerCase();
  return `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;
}

/** Which record the timeline is a project's or an activity's: how its posts name it. */
export type TimelineNoun = "project" | "activity";

function TimelinePost({
  item,
  owner,
  href,
  noun,
}: {
  item: TimelineItem;
  /** The record's author, and the record's page. */
  owner: ActorCard;
  href: string;
  noun: TimelineNoun;
}): ReactNode {
  switch (item.kind) {
    case "gifts":
      return <FeedPost row={item.row} owner={owner} subject={{ label: `This ${noun}`, href }} />;
    case "activity":
      return (
        <FeedPost
          row={{
            kind: "activity",
            key: item.key,
            date: item.activity.createdAt,
            activity: item.activity,
          }}
          owner={item.activity.author}
        />
      );
    case "update":
      return (
        <Post
          who={item.update.author}
          line={
            <>
              <Name actor={item.update.author} /> posted an update
              <On on={item.on} />
            </>
          }
          date={item.update.date}
          body={<UpdateBody update={item.update} />}
        />
      );
    case "attachment":
      return (
        <Post
          who={item.attachment.author}
          line={
            <>
              <Name actor={item.attachment.author} /> added {aKind(item.attachment.kind)}
              <On on={item.on} />
            </>
          }
          date={item.attachment.date}
          body={<AttachmentBody attachment={item.attachment} />}
        />
      );
    case "evaluation": {
      const [first] = item.evaluation.evaluators;
      if (!first) return null;
      return (
        <Post
          who={first}
          line={
            <>
              <EvaluatorNames evaluators={item.evaluation.evaluators} /> evaluated{" "}
              {item.on ? <PageLink link={item.on} /> : `the ${noun}`}
            </>
          }
          date={item.evaluation.date}
          body={<EvaluationBody evaluation={item.evaluation} />}
        />
      );
    }
    case "measurement":
      return (
        <Post
          who={item.measurement.author}
          line={
            <>
              <Name actor={item.measurement.author} /> recorded a measurement
              <On on={item.on} />
            </>
          }
          date={item.measurement.period}
          body={<MeasurementBody measurement={item.measurement} />}
        />
      );
    case "badge":
      return (
        <Post
          who={item.badge.issuer}
          line={
            <>
              <Name actor={item.badge.issuer} /> awarded{" "}
              {item.on ? <PageLink link={item.on} /> : `the ${noun}`} the badge{" "}
              <IntentLink href={badgeHref(item.badge)} className="post-name" dir="auto">
                {item.badge.title}
              </IntentLink>
            </>
          }
          date={item.badge.awarded}
        />
      );
  }
}

export async function RecordTimeline({
  uri,
  owner,
  href,
  noun,
  emptyless = false,
}: {
  uri: string;
  owner: ActorCard;
  href: string;
  noun: TimelineNoun;
  /** Nothing at all when empty: the page already shows something (an activity's text). */
  emptyless?: boolean;
}) {
  const items = await getTimeline(uri);
  if (items.length === 0) {
    if (emptyless) return null;
    return (
      <Empty
        icon={CalendarClock}
        title="Nothing here yet"
        description="Activities, updates, evaluations, badges and gifts show here as they come in."
      />
    );
  }
  const shown = items.slice(0, SHOWN);
  const rest = items.slice(SHOWN);
  return (
    <div className="stack">
      <ul className="post-feed">
        {shown.map((item) => (
          <TimelinePost key={item.key} item={item} owner={owner} href={href} noun={noun} />
        ))}
      </ul>
      {rest.length > 0 && (
        // A disclosure: opens without JavaScript, and its posts stay in the page for find.
        <details className="updates-more">
          <summary>Show {rest.length} older</summary>
          <ul className="post-feed">
            {rest.map((item) => (
              <TimelinePost key={item.key} item={item} owner={owner} href={href} noun={noun} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
