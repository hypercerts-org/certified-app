"use client";

// A profile's feed: what the account did, newest first, as posts, after X
// and Facebook. Each post opens with whoever acted (their avatar, a sentence
// naming them, the date under it); a record (an activity, a project) follows
// across the post's full width, its picture edge to edge at the bottom.
// Events that come in numbers (gifts, follows, badges awarded) are a day's
// worth in one post. Plain view models: the first page renders on the
// server, later pages here, for Load more.

import { Button, ErrorMessage, Skeleton, Text } from "@hypercerts-org/ui-react";
import { Folder, SquareCheckBig } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { ActorAvatar, ActorLink, ActorStack, AvatarStack } from "@/components/actor";
import { activityHref, actorHref, badgeHref, projectHref, skeletonSlots } from "@/components/cards";
import { Empty } from "@/components/empty";
import { IntentLink } from "@/components/intent-link";
import { LikeScope, PostLikeButton } from "@/components/like-button";
import { activityMeta, projectMeta } from "@/components/records";
import type { ActorCard, FeedLink, FeedRow, FeedTarget, Page } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";

const numberFormat = new Intl.NumberFormat("en");
const plural = (n: number, one: string, many: string) =>
  `${numberFormat.format(n)} ${n === 1 ? one : many}`;

export function Name({ actor }: { actor: ActorCard }) {
  return <ActorLink actor={actor} avatar={false} className="post-name" />;
}

export function PageLink({ link }: { link: FeedLink }) {
  return (
    <IntentLink href={link.href} className="post-name" dir="auto">
      {link.title}
    </IntentLink>
  );
}

/** "A, B and 3 others": the first few named, the rest counted. */
export function Names({
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
  return <ActorAvatar actor={actor} size={size} />;
}

/** A record the post is about: its title, a line under it and its summary. */
export function RecordText({
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
export function Media({ href, src }: { href: string; src: string | null }) {
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

/** Where a gift post's amount leads: the account's Funding tab for that direction. */
const FUNDING_TAB: Record<"received" | "given" | "recorded", string> = {
  received: "",
  given: "/given",
  recorded: "/confirmed",
};

const targetKey = (target: FeedTarget) =>
  target.kind === "account"
    ? target.actor.did
    : target.kind === "wallet"
      ? target.address
      : target.uri;

/** A gift's account or record, by name, to its page. */
function TargetName({ target }: { target: FeedTarget }) {
  if (target.kind === "account") return <Name actor={target.actor} />;
  if (target.kind === "wallet") {
    return target.href ? (
      <a
        href={target.href}
        className="post-name post-wallet"
        target="_blank"
        rel="noopener noreferrer"
      >
        {target.label}
      </a>
    ) : (
      <span className="post-wallet">{target.label}</span>
    );
  }
  return (
    <IntentLink href={target.href} className="post-name" dir="auto">
      {target.title}
    </IntentLink>
  );
}

/**
 * The accounts' faces and the records' pictures, as a stack; `total`: how
 * many in all. Pictures only: the sentence above names and links them.
 */
function TargetFaces({ targets, total }: { targets: FeedTarget[]; total: number }) {
  return (
    <AvatarStack total={total}>
      {targets.flatMap((target) =>
        target.kind === "wallet"
          ? []
          : [
              target.kind === "account" ? (
                <Face key={targetKey(target)} actor={target.actor} size="sm" />
              ) : (
                <span key={targetKey(target)} className="avatar-stack-thumb">
                  {target.imageUrl ? (
                    // biome-ignore lint/performance/noImgElement: indexed images come from many hosts
                    <img src={target.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <Folder size={12} aria-hidden />
                  )}
                </span>
              ),
            ],
      )}
    </AvatarStack>
  );
}

const GIFTS: Record<"received" | "given" | "recorded", string> = {
  received: "received",
  given: "gave",
  recorded: "recorded",
};

type Parts = {
  who: ActorCard;
  line: ReactNode;
  body?: ReactNode;
  media?: ReactNode;
  actions?: ReactNode;
};

/**
 * What a post is about when that isn't the owner's account: a project, on
 * its timeline. Its posts name it ("This project received 3 gifts") and lead
 * to its own tabs.
 */
export type FeedSubject = { label: string; href: string };

/** Who acted, what they did, and what it was about. */
function parts(row: FeedRow, owner: ActorCard, subject?: FeedSubject): Parts {
  const me = subject ? subject.label : <Name actor={owner} />;
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
            meta={activityMeta(row.activity)}
            text={row.activity.summary}
          />
        ),
        media: <Media href={href} src={row.activity.imageUrl} />,
        actions: <PostLikeButton subject={row.activity.uri} />,
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
            meta={projectMeta(row.project)}
            text={row.project.summary}
          />
        ),
        media: <Media href={href} src={row.project.imageUrl} />,
        actions: <PostLikeButton subject={row.project.uri} />,
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
        body:
          row.count > 1 ? (
            <ActorStack actors={row.subjects} total={row.count} />
          ) : (
            <Note note={row.note} />
          ),
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
            <ActorStack actors={row.recipients} total={row.count} />
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
        body: row.count > 1 ? <ActorStack actors={row.actors} total={row.count} /> : undefined,
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
        body: row.count > 1 ? <ActorStack actors={row.actors} total={row.count} /> : undefined,
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
      const tab = `${subject?.href ?? actorHref(owner)}/funding${FUNDING_TAB[row.direction]}`;
      const targets = row.targets.map((target) => (
        <TargetName key={targetKey(target)} target={target} />
      ));
      // Received: from the donors; given and recorded: to what it was for.
      const named =
        targets.length > 0 ? (
          <>
            {row.direction === "received" ? " from " : " to "}
            <Names items={targets} count={row.targetCount} />
          </>
        ) : null;
      return {
        who: owner,
        line: (
          <>
            {me} {GIFTS[row.direction]} {plural(row.count, "gift", "gifts")}
            {named}
          </>
        ),
        body: (
          <>
            {row.targets.filter((target) => target.kind !== "wallet").length > 1 && (
              <TargetFaces targets={row.targets} total={row.targetCount} />
            )}
            {main && (
              <IntentLink href={tab} className="post-amount">
                {main.amount}
                {others.map((total) => (
                  <span key={total.currency} className="post-muted">
                    {" "}
                    + {total.amount}
                  </span>
                ))}
              </IntentLink>
            )}
          </>
        ),
        media:
          row.targets.length === 1 && row.targets[0].kind === "record" ? (
            <Media href={row.targets[0].href} src={row.targets[0].imageUrl} />
          ) : undefined,
      };
    }
  }
}

/**
 * One post: whoever acted (their avatar), a sentence saying what happened,
 * the date under it, then what it was about. The account feed's posts and a
 * project's timeline are all this.
 */
export function Post({ who, line, date, body, media, actions }: Parts & { date: string | null }) {
  return (
    <li className="post-card">
      <div className="post-main">
        <div className="post-head">
          <IntentLink href={actorHref(who)} className="post-avatar" tabIndex={-1} aria-hidden>
            <Face actor={who} />
          </IntentLink>
          <div className="post-byline">
            <p className="post-line">{line}</p>
            {date && <span className="post-date">{date}</span>}
          </div>
        </div>
        {body}
      </div>
      {media}
      {actions && <div className="post-actions">{actions}</div>}
    </li>
  );
}

export function FeedPost({
  row,
  owner,
  subject,
}: {
  row: FeedRow;
  owner: ActorCard;
  subject?: FeedSubject;
}) {
  return <Post {...parts(row, owner, subject)} date={row.date} />;
}

function feedLikeSubject(row: FeedRow): string | null {
  if (row.kind === "activity") return row.activity.uri;
  if (row.kind === "project") return row.project.uri;
  return null;
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
  const likeSubjects = items.flatMap((row) => {
    const uri = feedLikeSubject(row);
    return uri ? [uri] : [];
  });
  return (
    <LikeScope subjects={likeSubjects}>
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
    </LikeScope>
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
