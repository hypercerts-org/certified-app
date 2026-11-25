// Explore's results, as on staging: rows (a picture, the title, what and
// when, the author and how long ago) or a gallery of cards. Plain view models
// only: the first page renders on the server, later ones in the browser.

import { Card, Skeleton, Text } from "@hypercerts-org/ui-react";
import { ActorAvatar, ActorHandle, ActorLink, ActorName } from "@/components/actor";
import { ActivityPost, actorHref, ProjectCardView, skeletonSlots } from "@/components/cards";
import { IntentLink } from "@/components/intent-link";
import { ActivityRow, ProjectRow, RecordRowSkeleton } from "@/components/records";
import type { ExploreKind, ExploreView } from "@/lib/explore-state";
import type { Age, ExploreAccount, ExploreActivity, ExploreProject } from "@/lib/hypercerts/views";

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

function ExploreActivityRow({ activity }: { activity: ExploreActivity }) {
  return (
    <li className="list-item explore-row">
      <ActivityRow
        activity={activity}
        end={
          <>
            <ActorLink actor={activity.author} className="list-item-who" />
            <AgeText age={activity.age} />
          </>
        }
      />
    </li>
  );
}

function ExploreProjectRow({ project }: { project: ExploreProject }) {
  return (
    <li className="list-item explore-row">
      <ProjectRow
        project={project}
        end={
          <>
            <ActorLink actor={project.author} className="list-item-who" />
            <AgeText age={project.age} />
          </>
        }
      />
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
  if (kind === "activities") return <ExploreActivityRow activity={item as ExploreActivity} />;
  if (kind === "projects") return <ExploreProjectRow project={item as ExploreProject} />;
  return <AccountRow account={item as ExploreAccount} />;
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
  // Cards: accounts and projects as the profile's tabs show them; activities
  // as posts, as everywhere.
  if (view === "gallery") {
    if (kind === "activities") {
      return (
        <ul className="posts divided">
          {(items as ExploreActivity[]).map((activity) => (
            <ActivityPost key={activity.uri} activity={activity} />
          ))}
        </ul>
      );
    }
    if (kind === "projects") {
      return (
        <ul className="card-gallery">
          {(items as ExploreProject[]).map((project) => (
            <ProjectCardView
              key={project.uri}
              project={project}
              author={project.author}
              footer={<AgeText age={project.age} />}
            />
          ))}
        </ul>
      );
    }
    return (
      <ul className="grid">
        {(items as ExploreAccount[]).map((account) => (
          <AccountCard key={account.did} account={account} />
        ))}
      </ul>
    );
  }
  return (
    <ul className="list-items explore-rows divided">
      {items.map((item) => (
        <Row key={exploreKey(item)} kind={kind} item={item} />
      ))}
    </ul>
  );
}

/** Rows on their way: a picture (or avatar), a title and a line, then the author. */
export function ExploreRowsSkeleton({ rows = 8, kind }: { rows?: number; kind: ExploreKind }) {
  return (
    <div className="list-items explore-rows divided" aria-hidden>
      {skeletonSlots(rows).map((slot) => (
        <div key={slot} className="list-item explore-row">
          {kind === "accounts" ? (
            <>
              <div className="skeleton-identity list-item-main">
                <Skeleton variant="box" className="skeleton-person-avatar" />
                <Skeleton variant="text" lines={2} className="overview-row-text" />
              </div>
              <Skeleton variant="line" className="explore-row-who-skeleton" />
            </>
          ) : (
            <RecordRowSkeleton
              end={<Skeleton variant="line" className="explore-row-who-skeleton" />}
            />
          )}
        </div>
      ))}
    </div>
  );
}
