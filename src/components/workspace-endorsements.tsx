// A workspace's endorsements, after the staging redesign's Workspace →
// Endorsements: received (hidden ones included, tagged, since this is where
// they can be shown again), given, and the endorsement lists the account
// keeps. Hiding, showing, revoking and endorsing someone come with the
// Hypercerts SDK's writes: until then their buttons are placeholders.

import { Badge, Button, Text } from "@hypercerts-org/ui-react";
import { ListChecks, Plus, ThumbsUp } from "lucide-react";
import type { ReactNode } from "react";
import { ActorRow } from "@/components/actor";
import { actorHref } from "@/components/cards";
import { ComingSoonButton } from "@/components/coming-soon";
import { Empty } from "@/components/empty";
import { PeopleListSkeleton } from "@/components/people-list";
import { ListGroups } from "@/components/profile-lists";
import type { PeoplePage } from "@/lib/hypercerts/queries";
import { endorsementLine, type ListCard, type PersonRow } from "@/lib/hypercerts/views";

function Row({ row, action }: { row: PersonRow; action: ReactNode }) {
  const { actor } = row;
  return (
    <li className="people-row endorsement-row">
      <ActorRow actor={actor} href={actorHref(actor)} secondary={endorsementLine(row)} />
      <span className="endorsement-row-end">
        {row.hidden && <Badge variant="tag">Hidden</Badge>}
        {row.date && (
          <Text as="span" size="body-sm" tone="muted" className="people-date">
            {row.date}
          </Text>
        )}
        {action}
      </span>
    </li>
  );
}

/** A write that isn't available yet; the exception (a hidden one) gets the filled button. */
function Placeholder({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  return (
    <ComingSoonButton variant={primary ? "primary" : "secondary"}>{children}</ComingSoonButton>
  );
}

function More({ page }: { page: PeoplePage }) {
  return page.more ? (
    <Text size="body-sm" tone="muted">
      Showing the latest {page.rows.length}.
    </Text>
  ) : null;
}

/** Endorsements others gave the account, hidden ones tagged. */
export function ReceivedEndorsements({ page, profile }: { page: PeoplePage; profile: string }) {
  if (page.rows.length === 0) {
    return (
      <Empty
        icon={ThumbsUp}
        title="No endorsements received yet"
        description="When another account endorses yours, it shows here. You choose which ones show on your profile."
        action={
          <Button href={profile} variant="secondary" size="sm">
            View your profile
          </Button>
        }
      />
    );
  }
  return (
    <>
      <ul className="people-list divided">
        {page.rows.map((row) => (
          <Row
            key={row.uri}
            row={row}
            // The exception (a hidden one) gets the filled button, as on staging.
            action={
              <Placeholder primary={row.hidden}>
                {row.hidden ? "Show on profile" : "Hide from profile"}
              </Placeholder>
            }
          />
        ))}
      </ul>
      <More page={page} />
    </>
  );
}

/** Endorsements the account gave. */
export function GivenEndorsements({ page }: { page: PeoplePage }) {
  if (page.rows.length === 0) {
    return (
      <Empty
        icon={ThumbsUp}
        title="No endorsements given yet"
        description="Accounts you endorse show here."
      />
    );
  }
  return (
    <>
      <ul className="people-list divided">
        {page.rows.map((row) => (
          <Row key={row.uri} row={row} action={<Placeholder>Revoke</Placeholder>} />
        ))}
      </ul>
      <More page={page} />
    </>
  );
}

/** The account's lists of endorsements, as rows, each leading to where it is managed. */
export function EndorsementLists({ lists, base }: { lists: ListCard[]; base: string }) {
  return lists.length > 0 ? (
    <ListGroups lists={lists} base={base} />
  ) : (
    <Empty
      icon={ListChecks}
      title="No endorsement lists yet"
      description="A list gathers endorsements to show together, like a set of references. Make one under Lists."
    />
  );
}

/** Shaped like four rows of accounts, so nothing moves when they arrive. */
export function EndorsementRowsSkeleton() {
  return <PeopleListSkeleton rows={4} />;
}

/** "Endorse someone": a placeholder until the SDK can write endorsements. */
export function EndorseSomeone() {
  return (
    <Placeholder>
      <Plus size={16} aria-hidden />
      Endorse someone
    </Placeholder>
  );
}
