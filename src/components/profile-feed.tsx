"use client";

// A profile's feed: what the account did, newest first, one card per event
// (or per day, for events that come in numbers). Each card: an icon for its
// kind, a line saying what happened, the date, and the thing itself below
// where there is one. Plain view models: the first page renders on the
// server, later pages here, for Load more.

import { Avatar, Button, ErrorMessage, Skeleton, Text } from "@hypercerts-org/ui-react";
import {
  Award,
  Folder,
  type LucideIcon,
  SquareCheckBig,
  ThumbsUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
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
    <IntentLink href={actorHref(actor)} className="feed-name" dir="auto">
      {nameOf(actor)}
    </IntentLink>
  );
}

/** "A, B and 3 more": the first few named, the rest counted. */
function Names({ items, count }: { items: ReactNode[]; count: number }) {
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
      {rest > 0 && ` and ${numberFormat.format(rest)} more`}
    </>
  );
}

function Faces({ actors }: { actors: ActorCard[] }) {
  return (
    <span className="trust-faces">
      {actors.map((actor) => (
        <Avatar
          key={actor.did}
          name={nameOf(actor).replace(/^@/, "")}
          src={actor.avatarUrl}
          size="sm"
        />
      ))}
    </span>
  );
}

function PageLink({ link }: { link: FeedLink }) {
  return (
    <IntentLink href={link.href} className="feed-name" dir="auto">
      {link.title}
    </IntentLink>
  );
}

/** A record the event is about: its picture, title and a line under it. */
function Record({
  href,
  title,
  meta,
  text,
  image,
}: {
  href: string;
  title: string;
  meta: string | null;
  text: string | null;
  image: string | null;
}) {
  return (
    <div className="feed-record">
      {image && (
        <IntentLink href={href} className="feed-record-image" tabIndex={-1} aria-hidden>
          {/* biome-ignore lint/performance/noImgElement: indexed images come from many hosts */}
          <img src={image} alt="" loading="lazy" />
        </IntentLink>
      )}
      <div className="feed-record-text">
        <IntentLink href={href} className="feed-record-title" dir="auto">
          {title}
        </IntentLink>
        {meta && (
          <Text as="span" size="body-sm" tone="muted">
            {meta}
          </Text>
        )}
        {text && (
          <Text size="body-sm" className="clamp" dir="auto">
            {text}
          </Text>
        )}
      </div>
    </div>
  );
}

function Note({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <blockquote className="feed-note" dir="auto">
      {note}
    </blockquote>
  );
}

const GIVEN: Record<"received" | "given" | "recorded", string> = {
  received: "Received",
  given: "Gave",
  recorded: "Recorded",
};

/** A row's icon, line and body. */
function parts(row: FeedRow): { icon: LucideIcon; line: ReactNode; body?: ReactNode } {
  switch (row.kind) {
    case "activity":
      return {
        icon: SquareCheckBig,
        line: "Published an activity",
        body: (
          <Record
            href={activityHref(row.activity.uri)}
            title={row.activity.title}
            meta={row.activity.period}
            text={row.activity.summary}
            image={row.activity.imageUrl}
          />
        ),
      };
    case "project":
      return {
        icon: Folder,
        line: "Started a project",
        body: (
          <Record
            href={projectHref(row.project)}
            title={row.project.title}
            meta={plural(row.project.activityCount, "activity", "activities")}
            text={row.project.summary}
            image={row.project.imageUrl}
          />
        ),
      };
    case "endorsed":
      return {
        icon: ThumbsUp,
        line: (
          <>
            Endorsed{" "}
            {row.subjects.length > 0 ? (
              <Names
                items={row.subjects.map((actor) => <Name key={actor.did} actor={actor} />)}
                count={row.count}
              />
            ) : (
              plural(row.count, "record", "records")
            )}
            {row.badge && row.badge !== "Endorsement" && (
              <span className="feed-muted"> · {row.badge}</span>
            )}
          </>
        ),
        body: row.count > 1 ? <Faces actors={row.subjects} /> : <Note note={row.note} />,
      };
    case "endorsedBy":
      return {
        icon: ThumbsUp,
        line: (
          <>
            Endorsed by <Name actor={row.issuer} />
            {row.badge && row.badge !== "Endorsement" && (
              <span className="feed-muted"> · {row.badge}</span>
            )}
          </>
        ),
        body: <Note note={row.note} />,
      };
    case "badge":
      return {
        icon: Award,
        line: (
          <>
            Received the badge{" "}
            <IntentLink href={badgeHref(row.badge)} className="feed-name" dir="auto">
              {row.badge.title}
            </IntentLink>{" "}
            from <Name actor={row.badge.issuer} />
          </>
        ),
      };
    case "awarded":
      return {
        icon: Award,
        line: (
          <>
            Awarded <PageLink link={row.badge} /> to{" "}
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
      };
    case "followers":
      return {
        icon: Users,
        line: (
          <>
            Followed by{" "}
            <Names
              items={row.actors.map((actor) => <Name key={actor.did} actor={actor} />)}
              count={row.count}
            />
          </>
        ),
        body: row.count > 1 ? <Faces actors={row.actors} /> : undefined,
      };
    case "following":
      return {
        icon: UserPlus,
        line: (
          <>
            Followed{" "}
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
        icon: UserPlus,
        line: (
          <>
            Followed {row.count === 1 ? "the project " : "the projects "}
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
        icon: Wallet,
        line: (
          <>
            {GIVEN[row.direction]} {plural(row.count, "gift", "gifts")}
            {row.direction !== "given" && row.donors > 0 && (
              <> from {plural(row.donors, "named donor", "named donors")}</>
            )}
          </>
        ),
        body: main ? (
          <p className="feed-amount">
            {main.amount}
            {others.map((total) => (
              <span key={total.currency} className="feed-muted">
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

export function FeedRowView({ row }: { row: FeedRow }) {
  const { icon: Icon, line, body } = parts(row);
  return (
    <li className="feed-item">
      <span className="feed-icon">
        <Icon size={16} aria-hidden />
      </span>
      <div className="feed-content">
        <div className="feed-head">
          <p className="feed-line">{line}</p>
          {row.date && <span className="feed-date">{row.date}</span>}
        </div>
        {body}
      </div>
    </li>
  );
}

/** The feed, with Load more. */
export function ProfileFeed({ did, initial }: { did: string; initial: Page<FeedRow> }) {
  const nextPageUrl = useCallback(
    (cursor: string) => `/api/profile-feed?${new URLSearchParams({ did, cursor })}`,
    [did],
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
      <ul className="feed">
        {items.map((row) => (
          <FeedRowView key={row.key} row={row} />
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

/** Feed cards on their way: an icon, a line, and room for a record. */
export function ProfileFeedSkeleton() {
  return (
    <div className="feed" aria-hidden>
      {skeletonSlots(3).map((slot) => (
        <div key={slot} className="feed-item">
          <Skeleton variant="box" className="feed-icon" />
          <div className="feed-content">
            <Skeleton variant="line" className="skeleton-card-title" />
            <Skeleton variant="text" lines={2} />
          </div>
        </div>
      ))}
    </div>
  );
}
