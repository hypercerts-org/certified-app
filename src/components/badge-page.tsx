// A badge's own page, under the account that defined it
// (/{issuer}/badge/{rkey}): what the badge is, then who holds it, by the
// holder's response: Accepted, or Awaiting response. A holder is an account
// or a record (a project, an activity). Every badge on a profile links here, so a badge can be followed to everyone else who holds
// it.

import { Eyebrow, Skeleton, Text } from "@hypercerts-org/ui-react";
import { notFound } from "next/navigation";
import { ActorLink } from "@/components/actor";
import { BadgeHolderList } from "@/components/badge-holders";
import { BadgeIcon } from "@/components/badges";
import { PageTitle } from "@/components/page-title";
import { PeopleListSkeleton } from "@/components/people-list";
import { ProfileTabs, SegmentedLinksSkeleton } from "@/components/profile-actions";
import { getActor, getBadge, listBadgeHolders } from "@/lib/hypercerts/queries";

export type BadgeParams = Promise<{ actor: string; rkey: string }>;
type Which = "accepted" | "awaiting";

/** A record key as AT Protocol allows it; anything else is no badge. */
const RKEY = /^[A-Za-z0-9._:~-]{1,512}$/;

const numberFormat = new Intl.NumberFormat("en");

/** The badge at these params, or a 404. Shared with the pages' titles. */
export async function badgeFrom(params: BadgeParams) {
  const { actor: id, rkey } = await params;
  if (!RKEY.test(rkey)) notFound();
  const owner = await getActor(decodeURIComponent(id));
  if (!owner) notFound();
  const badge = await getBadge(`at://${owner.did}/app.certified.badge.definition/${rkey}`);
  if (!badge) notFound();
  // The tabs link within the address the page was opened at (handle or DID).
  return { badge, base: `/${decodeURIComponent(id)}/badge/${rkey}` };
}

export async function BadgePage({ params, which }: { params: BadgeParams; which: Which }) {
  const { badge, base } = await badgeFrom(params);
  const [accepted, awaiting] = await Promise.all([
    listBadgeHolders(badge.uri, "accepted", badge.allowedIssuers),
    listBadgeHolders(badge.uri, "unanswered", badge.allowedIssuers),
  ]);
  const shown = which === "accepted" ? accepted : awaiting;
  const count = (n: number) => (n > 0 ? numberFormat.format(n) : undefined);
  return (
    <>
      <header className="badge-hero">
        <BadgeIcon badge={badge} large />
        <div className="stack">
          <Eyebrow>{badge.type ?? "Badge"}</Eyebrow>
          <PageTitle>
            <span dir="auto">{badge.title}</span>
          </PageTitle>
          <Text as="span" size="body-sm">
            Issued by <ActorLink actor={badge.issuer} />
          </Text>
          {badge.description && (
            <Text relaxed className="prewrap" dir="auto">
              {badge.description}
            </Text>
          )}
        </div>
      </header>
      <div className="profile-list-page">
        <ProfileTabs
          label="Holders"
          variant="segmented"
          tabs={[
            { label: "Accepted", href: base, count: count(accepted.total) },
            { label: "Awaiting response", href: `${base}/awaiting`, count: count(awaiting.total) },
          ]}
        />
        <BadgeHolderList
          // A new list per tab: each keeps its own pages.
          key={which}
          badge={badge.uri}
          response={which === "accepted" ? "accepted" : "unanswered"}
          initial={{ items: shown.items, cursor: shown.cursor }}
          empty={which === "accepted" ? "No holders yet" : "No holders awaiting a response"}
        />
      </div>
    </>
  );
}

/** The page on its way: the badge's header, the switch, then holders. */
export function BadgePageSkeleton({ which }: { which: Which }) {
  return (
    <>
      <div className="badge-hero" aria-hidden>
        <Skeleton variant="box" className="badge-icon badge-icon-large" />
        <div className="stack">
          <Skeleton variant="line" className="skeleton-meta" />
          <Skeleton variant="line" className="skeleton-name" />
          <Skeleton variant="text" lines={2} className="skeleton-lead" />
        </div>
      </div>
      <div className="profile-list-page">
        <SegmentedLinksSkeleton
          labels={["Accepted", "Awaiting response"]}
          current={which === "accepted" ? "Accepted" : "Awaiting response"}
        />
        <PeopleListSkeleton />
      </div>
    </>
  );
}
