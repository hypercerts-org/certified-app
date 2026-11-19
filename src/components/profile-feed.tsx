"use client";

// A profile's feed: what the account did, newest first, as posts, after X
// and Facebook. Each post opens with whoever acted (their avatar, a sentence
// naming them, the date under it); a record (an activity, a project) follows
// across the post's full width, its picture edge to edge at the bottom.
// Events that come in numbers (gifts, follows, badges awarded) are a day's
// worth in one post. Plain view models: the first page renders on the
// server, later pages here, for Load more.

import { Avatar, Button, ErrorMessage, Skeleton, Text } from "@hypercerts-org/ui-react";
import { SquareCheckBig } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { activityHref, actorHref, badgeHref, projectHref, skeletonSlots } from "@/components/cards";
import { Empty } from "@/components/empty";
import { IntentLink } from "@/components/intent-link";
import { nameOf } from "@/components/list-items";
import type { ActorCard, FeedLink, FeedRow, Page } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";

const numberFormat = new Intl.NumberFormat("en");
const plural = (n: number, one: string, many: string) =>
  `${numberFormat.format(n)} ${n === 1 ? one : many}`;

function Name({ actor }: { actor: ActorCard }) {
  return (
    <IntentLink href={actorHref(actor)} className="post-name" dir="auto">
      {nameOf(actor)}
    </IntentLink>
  );
}

function PageLink({ link }: { link: FeedLink }) {
  return (
    <IntentLink href={link.href} className="post-name" dir="auto">
      {link.title}
    </IntentLink>
  );
}

/** "A, B and 3 others": the first few named, the rest counted. */
function Names({
  items,
  count,
  others = "others",
}: {
  items: ReactNode[];
  count: number;
  others?: string;
}) {
  const rest = count - items.length;
  return (
    <>
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered few
        <span key={i}>
          {i > 0 && (i === items.length - 1 && rest <= 0 ? " and " : ", ")}
          {item}
        </span>
      ))}
      {rest > 0 &&
        ` and ${numberFormat.format(rest)} ${rest === 1 ? others.replace(/s$/, "") : others}`}
    </>
  );
}

function Face({ actor, size = "md" }: { actor: ActorCard; size?: "sm" | "md" }) {
  return (
    <Avatar
      name={nameOf(actor).replace(/^@/, "")}
      src={actor.avatarUrl}
      size={size}
      className={actor.isOrganization ? "avatar-square" : undefined}
    />
  );
}

function Faces({ actors }: { actors: ActorCard[] }) {
  return (
    <span className="trust-faces">
      {actors.map((actor) => (
        <Face key={actor.did} actor={actor} size="sm" />
      ))}
    </span>
  );
}

/** A record the post is about: its title, a line under it and its summary. */
function RecordText({
  href,
  title,
  meta,
  text,
}: {
  href: string;
  title: string;
  meta: string | null;
  text: string | null;
}) {
  return (
    <div className="post-record">
      <IntentLink href={href} className="post-title" dir="auto">
        {title}
      </IntentLink>
      {meta && (
        <Text as="span" size="body-sm" tone="muted">
          {meta}
        </Text>
      )}
      {text && (
        <Text className="clamp" dir="auto">
          {text}
        </Text>
      )}
    </div>
  );
}

/** A record's picture, the post's full width. */
function Media({ href, src }: { href: string; src: string | null }) {
  if (!src) return null;
  return (
    <IntentLink href={href} className="post-media" tabIndex={-1} aria-hidden>
      {/* biome-ignore lint/performance/noImgElement: indexed images come from many hosts */}
      <img
        src={src}
        alt=""
        loading="lazy"
        // A picture that fails to load leaves no empty frame behind.
        onError={(event) => {
          const frame = event.currentTarget.parentElement;
          if (frame) frame.hidden = true;
        }}
      />
    </IntentLink>
  );
}

function Note({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <blockquote className="post-note" dir="auto">
      {note}
    </blockquote>
  );
}

/** "· Organization Endorsement", when it says more than "Endorsement". */
function Kind({ badge }: { badge: string | null }) {
  if (!badge || badge === "Endorsement") return null;
  return <span className="post-muted"> · {badge}</span>;
}

const GIFTS: Record<"received" | "given" | "recorded", string> = {
  received: "received",
  given: "gave",
  recorded: "recorded",
};

type Parts = { who: ActorCard; line: ReactNode; body?: ReactNode; media?: ReactNode };

/** Who acted, what they did, and what it was about. */
function parts(row: FeedRow, owner: ActorCard): Parts {
  const me = <Name actor={owner} />;
  switch (row.kind) {
    case "activity": {
      const href = activityHref(row.activity.uri);
      return {
        who: owner,
        line: <>{me} published an activity</>,
        body: (
          <RecordText
            href={href}
            title={row.activity.title}
            meta={row.activity.period}
            text={row.activity.summary}
          />
        ),
        media: <Media href={href} src={row.activity.imageUrl} />,
      };
    }
    case "project": {
      const href = projectHref(row.project);
      return {
        who: owner,
        line: <>{me} started a project</>,
        body: (
          <RecordText
            href={href}
            title={row.project.title}
            meta={plural(row.project.activityCount, "activity", "activities")}
            text={row.project.summary}
          />
        ),
        media: <Media href={href} src={row.project.imageUrl} />,
      };
    }
    case "endorsed":
      return {
        who: owner,
        line: (
          <>
            {me} endorsed{" "}
            {row.subjects.length > 0 ? (
              <Names
                items={row.subjects.map((actor) => <Name key={actor.did} actor={actor} />)}
                count={row.count}
              />
            ) : (
              plural(row.count, "record", "records")
            )}
            <Kind badge={row.badge} />
          </>
        ),
        body: row.count > 1 ? <Faces actors={row.subjects} /> : <Note note={row.note} />,
      };
    case "endorsedBy":
      return {
        who: row.issuer,
        line: (
          <>
            <Name actor={row.issuer} /> endorsed {me}
            <Kind badge={row.badge} />
          </>
        ),
        body: <Note note={row.note} />,
      };
    case "badge":
      return {
        who: row.badge.issuer,
        line: (
          <>
            <Name actor={row.badge.issuer} /> awarded {me} the badge{" "}
            <IntentLink href={badgeHref(row.badge)} className="post-name" dir="auto">
              {row.badge.title}
            </IntentLink>
          </>
        ),
      };
    case "awarded":
      return {
        who: owner,
        line: (
          <>
            {me} awarded <PageLink link={row.badge} /> to{" "}
            {row.recipients.length > 0 ? (
              <Names
                items={row.recipients.map((actor) => <Name key={actor.did} actor={actor} />)}
                count={row.count}
              />
            ) : (
              plural(row.count, "account", "accounts")
            )}
          </>
        ),
        body:
          row.count > 1 && row.recipients.length > 1 ? (
            <Faces actors={row.recipients} />
          ) : undefined,
      };
    case "followers":
      return {
        who: row.actors[0] ?? owner,
        line: (
          <>
            <Names
              items={row.actors.map((actor) => <Name key={actor.did} actor={actor} />)}
              count={row.count}
            />{" "}
            followed {me}
          </>
        ),
        body: row.count > 1 ? <Faces actors={row.actors} /> : undefined,
      };
    case "following":
      return {
        who: owner,
        line: (
          <>
            {me} followed{" "}
            <Names
              items={row.actors.map((actor) => <Name key={actor.did} actor={actor} />)}
              count={row.count}
            />
          </>
        ),
        body: row.count > 1 ? <Faces actors={row.actors} /> : undefined,
      };
    case "projectsFollowed":
      return {
        who: owner,
        line: (
          <>
            {me} followed {row.count === 1 ? "the project " : "the projects "}
            <Names
              items={row.projects.map((project) => <PageLink key={project.href} link={project} />)}
              count={row.count}
            />
          </>
        ),
      };
    case "gifts": {
      const [main, ...others] = row.totals;
      return {
        who: owner,
        line: (
          <>
            {me} {GIFTS[row.direction]} {plural(row.count, "gift", "gifts")}
            {row.direction !== "given" && row.donors > 0 && (
              <> from {plural(row.donors, "named donor", "named donors")}</>
            )}
          </>
        ),
        body: main ? (
          <p className="post-amount">
            {main.amount}
            {others.map((total) => (
              <span key={total.currency} className="post-muted">
                {" "}
                + {total.amount}
              </span>
            ))}
          </p>
        ) : undefined,
      };
    }
  }
}

export function FeedPost({ row, owner }: { row: FeedRow; owner: ActorCard }) {
  const { who, line, body, media } = parts(row, owner);
  return (
    <li className="post-card">
      <div className="post-main">
        <div className="post-head">
          <IntentLink href={actorHref(who)} className="post-avatar" tabIndex={-1} aria-hidden>
            <Face actor={who} />
          </IntentLink>
          <div className="post-byline">
            <p className="post-line">{line}</p>
            {row.date && <span className="post-date">{row.date}</span>}
          </div>
        </div>
        {body}
      </div>
      {media}
    </li>
  );
}

/** The feed, with Load more. */
export function ProfileFeed({ owner, initial }: { owner: ActorCard; initial: Page<FeedRow> }) {
  const nextPageUrl = useCallback(
    (cursor: string) => `/api/profile-feed?${new URLSearchParams({ did: owner.did, cursor })}`,
    [owner.did],
  );
  const { items, hasMore, loading, error, loadMore } = useCursorPages(
    initial,
    nextPageUrl,
    (row: FeedRow) => row.key,
  );
  if (items.length === 0) {
    return (
      <Empty
        icon={SquareCheckBig}
        title="Nothing here yet"
        description="When this account publishes, endorses or follows, it shows here."
      />
    );
  }
  return (
    <div className="stack">
      <ul className="post-feed">
        {items.map((row) => (
          <FeedPost key={row.key} row={row} owner={owner} />
        ))}
      </ul>
      {error && <ErrorMessage live>{error}</ErrorMessage>}
      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}

/** Posts on their way: an avatar and a line, then room for a record. */
export function ProfileFeedSkeleton() {
  return (
    <div className="post-feed" aria-hidden>
      {skeletonSlots(3).map((slot) => (
        <div key={slot} className="post-card">
          <div className="post-main">
            <div className="post-head">
              <Skeleton variant="box" className="skeleton-person-avatar" />
              <div className="post-byline">
                <Skeleton variant="line" className="skeleton-card-title" />
                <Skeleton variant="line" className="skeleton-card-meta" />
              </div>
            </div>
            <Skeleton variant="text" lines={2} />
          </div>
        </div>
      ))}
    </div>
  );
}
