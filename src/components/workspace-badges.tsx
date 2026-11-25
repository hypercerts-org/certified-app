// Workspace → Badges: the badges awarded to the account, by its response
// (awaiting, accepted, rejected), each with Accept/Reject actions, and the
// badges it defined for others, each with an Award action.

import { AwardBadgeDialog, BadgeResponseButtons, NewBadgeDialog } from "@/components/badge-dialogs";
import { BadgeList, IssuedBadgeList } from "@/components/badges";
import type { IssuedBadge } from "@/lib/hypercerts/queries";
import type { BadgeCard } from "@/lib/hypercerts/views";

export type ReceivedKind = "awaiting" | "accepted" | "rejected";

const EMPTY: Record<ReceivedKind, { title: string; description: string }> = {
  awaiting: {
    title: "No badges awaiting a response",
    description: "When an account awards you a badge, it shows here to accept or reject.",
  },
  accepted: {
    title: "No badges accepted yet",
    description: "Badges you accept show on your profile.",
  },
  rejected: {
    title: "No badges rejected yet",
    description: "A badge you reject never shows on your profile.",
  },
};

/**
 * Received badges with their responses: accept or reject one awaiting a
 * response; reject an accepted one (it leaves the profile); accept a
 * rejected one again.
 */
export function ReceivedBadges({
  repo,
  kind,
  badges,
}: {
  repo: string;
  kind: ReceivedKind;
  badges: BadgeCard[];
}) {
  return (
    <BadgeList
      badges={badges}
      empty={EMPTY[kind].title}
      emptyDescription={EMPTY[kind].description}
      actions={(badge) => (
        <BadgeResponseButtons
          repo={repo}
          awardUri={badge.uri}
          badgeUri={`at://${badge.ownerDid}/app.certified.badge.definition/${badge.rkey}`}
          kind={kind}
        />
      )}
    />
  );
}

/** Badges the workspace account defined, each with an Award action. */
export function IssuedBadges({ repo, badges }: { repo: string; badges: IssuedBadge[] }) {
  return (
    <IssuedBadgeList
      badges={badges}
      actions={(badge) => (
        <AwardBadgeDialog repo={repo} definitionUri={badge.uri} badgeTitle={badge.title} />
      )}
    />
  );
}

/** "New badge": opens a dialog to define a new badge in `repo`. */
export function NewBadge({ repo }: { repo: string }) {
  return <NewBadgeDialog repo={repo} />;
}
