// Explore's results, as on staging: rows (a picture, the title, what and
// when, the author and how long ago) or a gallery of cards. Plain view models
// only: the first page renders on the server, later ones in the browser.

import { Card, Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import { Folder, SquareCheckBig } from "lucide-react";
import { ActorAvatar, ActorHandle, ActorName } from "@/components/actor";
import { activityHref, actorHref, projectHref, skeletonSlots } from "@/components/cards";
import { IntentLink } from "@/components/intent-link";
import { Thumb, Who } from "@/components/list-items";
import type { ExploreKind, ExploreView } from "@/lib/explore-state";
import type {
  ActorCard,
  Age,
  ExploreAccount,
  ExploreActivity,
  ExploreProject,
} from "@/lib/hypercerts/views";

export type ExploreItem = ExploreActivity | ExploreProject | ExploreAccount;

/** An item's key: a record's URI, an account's DID. */
export const exploreKey = (item: ExploreItem) => ("uri" in item ? item.uri : item.did);

function AgeText({ age }: { age: Age | null }) {
  if (!age) return <span className="explore-age" />;
  return (
    <time className="explore-age" dateTime={age.iso}>
      {age.label}
    </time>
  );
}

/** "by Name", under the title where the author column gives way (phones). */
function By({ actor }: { actor: ActorCard }) {
  return (
    <span className="list-item-meta explore-by">
      by <ActorName actor={actor} />
    </span>
  );
}

const joined = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ");

const activities = (n: number) => (n === 1 ? "1 activity" : `${n} activities`);

function ActivityRow({ activity }: { activity: ExploreActivity }) {
  const meta = joined(activity.period, activity.scope);
  return (
    <li className="list-item explore-row">
      <span className="list-item-main">
        <Thumb src={activity.imageUrl} project={false} />
        <span className="list-item-text">
          <IntentLink href={activityHref(activity.uri)} className="list-item-title" dir="auto">
            {activity.title}
          </IntentLink>
          {meta && <span className="list-item-meta">{meta}</span>}
          <By actor={activity.author} />
        </span>
      </span>
      <Who actor={activity.author} />
      <AgeText age={activity.age} />
    </li>
  );
}

function ProjectRow({ project }: { project: ExploreProject }) {
  return (
    <li className="list-item explore-row">
      <span className="list-item-main">
        <Thumb src={project.imageUrl} project />
        <span className="list-item-text">
          <IntentLink href={projectHref(project)} className="list-item-title" dir="auto">
            {project.title}
          </IntentLink>
          <span className="list-item-meta">{activities(project.activityCount)}</span>
          <By actor={project.author} />
        </span>
      </span>
      <Who actor={project.author} />
      <AgeText age={project.age} />
    </li>
  );
}

function AccountRow({ account }: { account: ExploreAccount }) {
  return (
    <li className="list-item explore-row">
      <IntentLink href={actorHref(account)} className="list-item-main">
        <ActorAvatar actor={account} />
        <span className="list-item-text">
          <ActorName actor={account} className="list-item-title" />
          {account.description && (
            <span className="list-item-meta" dir="auto">
              {account.description}
            </span>
          )}
        </span>
      </IntentLink>
      <span className="list-item-meta explore-handle">
        <ActorHandle actor={account} />
      </span>
      <AgeText age={account.age} />
    </li>
  );
}

/** The author above a gallery card: avatar, name and handle. */
function CardAuthor({ actor }: { actor: ActorCard }) {
  return (
    <IntentLink href={actorHref(actor)} className="explore-card-author">
      <ActorAvatar actor={actor} size="sm" />
      <span className="list-item-text">
        <ActorName actor={actor} className="list-item-title" />
        <ActorHandle actor={actor} className="list-item-meta" />
      </span>
    </IntentLink>
  );
}

function CardImage({ href, src, project }: { href: string; src: string | null; project: boolean }) {
  return (
    <IntentLink href={href} className="explore-card-image" tabIndex={-1} aria-hidden>
      {src ? (
        // biome-ignore lint/performance/noImgElement: indexed images come from many hosts
        <img src={src} alt="" loading="lazy" />
      ) : project ? (
        <Folder size={32} strokeWidth={1.25} aria-hidden />
      ) : (
        <SquareCheckBig size={32} strokeWidth={1.25} aria-hidden />
      )}
    </IntentLink>
  );
}

function WorkCard({
  href,
  title,
  text,
  image,
  project,
  author,
  age,
}: {
  href: string;
  title: string;
  text: string | null;
  image: string | null;
  project: boolean;
  author: ActorCard;
  age: Age | null;
}) {
  return (
    <li className="explore-card">
      <CardAuthor actor={author} />
      <CardImage href={href} src={image} project={project} />
      <Heading level={3} size="heading" className="explore-card-title">
        <IntentLink href={href} className="work-card-link" dir="auto">
          {title}
        </IntentLink>
      </Heading>
      {text && (
        <Text size="body-sm" tone="muted" className="clamp" dir="auto">
          {text}
        </Text>
      )}
      <AgeText age={age} />
    </li>
  );
}

function AccountCard({ account }: { account: ExploreAccount }) {
  return (
    <Card as="li" variant="panel" className="explore-account-card">
      <IntentLink href={actorHref(account)} className="explore-account-link">
        <ActorAvatar actor={account} size="lg" />
        <span className="list-item-text">
          <ActorName actor={account} className="list-item-title" />
          <ActorHandle actor={account} className="list-item-meta" />
        </span>
      </IntentLink>
      {account.description && (
        <Text size="body-sm" tone="muted" className="clamp" dir="auto">
          {account.description}
        </Text>
      )}
    </Card>
  );
}

function Row({ kind, item }: { kind: ExploreKind; item: ExploreItem }) {
  if (kind === "activities") return <ActivityRow activity={item as ExploreActivity} />;
  if (kind === "projects") return <ProjectRow project={item as ExploreProject} />;
  return <AccountRow account={item as ExploreAccount} />;
}

function GalleryCard({ kind, item }: { kind: ExploreKind; item: ExploreItem }) {
  if (kind === "accounts") return <AccountCard account={item as ExploreAccount} />;
  if (kind === "projects") {
    const project = item as ExploreProject;
    return (
      <WorkCard
        href={projectHref(project)}
        title={project.title}
        text={project.summary ?? activities(project.activityCount)}
        image={project.imageUrl}
        project
        author={project.author}
        age={project.age}
      />
    );
  }
  const activity = item as ExploreActivity;
  return (
    <WorkCard
      href={activityHref(activity.uri)}
      title={activity.title}
      text={activity.summary}
      image={activity.imageUrl}
      project={false}
      author={activity.author}
      age={activity.age}
    />
  );
}

export function ExploreItems({
  kind,
  items,
  view = "list",
}: {
  kind: ExploreKind;
  items: ExploreItem[];
  view?: ExploreView;
}) {
  if (view === "gallery") {
    return (
      <ul className={kind === "accounts" ? "grid" : "explore-gallery"}>
        {items.map((item) => (
          <GalleryCard key={exploreKey(item)} kind={kind} item={item} />
        ))}
      </ul>
    );
  }
  return (
    <ul className="list-items explore-rows">
      {items.map((item) => (
        <Row key={exploreKey(item)} kind={kind} item={item} />
      ))}
    </ul>
  );
}

/** Rows on their way: a picture (or avatar), a title and a line, then the author. */
export function ExploreRowsSkeleton({ rows = 8, kind }: { rows?: number; kind: ExploreKind }) {
  return (
    <div className="list-items explore-rows" aria-hidden>
      {skeletonSlots(rows).map((slot) => (
        <div key={slot} className="list-item explore-row">
          <div className="skeleton-identity list-item-main">
            <Skeleton
              variant="box"
              className={kind === "accounts" ? "skeleton-person-avatar" : "list-item-thumb"}
            />
            <Skeleton variant="text" lines={2} className="overview-row-text" />
          </div>
          <Skeleton variant="line" className="explore-row-who-skeleton" />
        </div>
      ))}
    </div>
  );
}

/** Gallery cards on their way: an author, a picture and a title. */
export function ExploreGallerySkeleton({ count = 8, kind }: { count?: number; kind: ExploreKind }) {
  if (kind === "accounts") {
    return (
      <div className="grid" aria-hidden>
        {skeletonSlots(count).map((slot) => (
          <Card key={slot} variant="panel" className="explore-account-card">
            <div className="skeleton-identity">
              <Skeleton variant="box" className="skeleton-person-avatar" />
              <Skeleton variant="text" lines={2} className="overview-row-text" />
            </div>
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className="explore-gallery" aria-hidden>
      {skeletonSlots(count).map((slot) => (
        <div key={slot} className="explore-card">
          <Skeleton variant="line" className="skeleton-card-meta" />
          <Skeleton variant="box" className="explore-card-image" />
          <Skeleton variant="line" className="skeleton-card-title" />
        </div>
      ))}
    </div>
  );
}
