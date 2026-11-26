// Workspace → Badges, in three tabs: Received (badges others awarded the
// account, awaiting its response first, each with Accept/Reject), Awarded
// (the badges it gave, and what each recipient answered), and Your badges
// (the badges it created, each with an Award action). Plain endorsements are
// in Endorsements, not here.

import { IdentityLink } from "@hypercerts-org/ui-react";
import { actorHref, identityOf } from "@/components/actor";
import { AwardBadgeDialog, BadgeResponseButtons, NewBadgeDialog } from "@/components/badge-dialogs";
import { BadgeList, IssuedBadgeList } from "@/components/badges";
import { IntentLink } from "@/components/intent-link";
import type { AwardedBadge, IssuedBadge } from "@/lib/hypercerts/queries";
import type { BadgeCard } from "@/lib/hypercerts/views";

const RESPONSE_KIND = {
  unanswered: "awaiting",
  accepted: "accepted",
  rejected: "rejected",
} as const;

/**
 * Badges others awarded the account, as one list: those awaiting its
 * response first (Accept or Reject), then accepted ones (on its profile; Reject
 * takes one off), then rejected ones (Accept puts one back).
 */
export function ReceivedBadges({ repo, badges }: { repo: string; badges: BadgeCard[] }) {
  return (
    <BadgeList
      badges={badges}
      empty="No badges received yet"
      emptyDescription="When an account awards you a badge, it shows here for you to accept or reject. Badges you accept show on your profile."
      state={(badge) =>
        badge.status === "unanswered"
          ? "Awaiting your response"
          : badge.status === "rejected"
            ? "Rejected"
            : null
      }
      actions={(badge) => (
        <BadgeResponseButtons
          repo={repo}
          awardUri={badge.uri}
          badgeUri={`at://${badge.ownerDid}/app.certified.badge.definition/${badge.rkey}`}
          kind={RESPONSE_KIND[badge.status]}
        />
      )}
    />
  );
}

const AWARDED_STATE = {
  unanswered: "Awaiting response",
  accepted: "Accepted",
  rejected: "Rejected",
} as const;

/** The badges the account awarded, who each went to, and what they answered. */
export function AwardedBadges({ badges }: { badges: AwardedBadge[] }) {
  return (
    <BadgeList
      badges={badges}
      empty="No badges awarded yet"
      emptyDescription="Award one of your badges to an account, project or activity. It shows here with their answer: awaiting response, accepted or rejected."
      state={(badge) => AWARDED_STATE[badge.status]}
      who={({ recipient }) => (
        <>
          To{" "}
          {recipient.kind === "account" ? (
            <IdentityLink
              {...identityOf(recipient.actor)}
              href={actorHref(recipient.actor)}
              avatar={false}
            />
          ) : (
            <IntentLink href={recipient.href} dir="auto">
              {recipient.title}
            </IntentLink>
          )}
        </>
      )}
    />
  );
}

/** The badges the account created, each with an Award action. */
export function YourBadges({ repo, badges }: { repo: string; badges: IssuedBadge[] }) {
  return (
    <IssuedBadgeList
      badges={badges}
      empty="No badges yet"
      emptyDescription="Create a badge to award to accounts, projects or activities, such as a certification or a thank-you."
      actions={(badge) => (
        <AwardBadgeDialog repo={repo} definitionUri={badge.uri} badgeTitle={badge.title} />
      )}
    />
  );
}

/** "Create badge": opens a dialog to create a badge in `repo`. */
export function NewBadge({ repo }: { repo: string }) {
  return <NewBadgeDialog repo={repo} />;
}
