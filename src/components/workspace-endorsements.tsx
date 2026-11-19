// A workspace's endorsements, after the staging redesign's Workspace →
// Endorsements: received (hidden ones included, tagged, since this is where
// they can be shown again), given, and the endorsement lists the account
// keeps. Hiding, showing, revoking and endorsing someone come with the
// Hypercerts SDK's writes: until then their buttons are placeholders.

import { Badge, Button, EmptyState, IdentityRow, Text } from "@hypercerts-org/ui-react";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { actorHref } from "@/components/cards";
import { ComingSoonButton } from "@/components/coming-soon";
import { PeopleListSkeleton } from "@/components/people-list";
import { LIST_KINDS, ListCards, type ListKind } from "@/components/workspace-lists";
import type { PeoplePage } from "@/lib/hypercerts/queries";
import type { ListCard, PersonRow } from "@/lib/hypercerts/views";

function Row({ row, action }: { row: PersonRow; action: ReactNode }) {
  const { actor } = row;
  const handle = actor.handle ? `@${actor.handle}` : null;
  return (
    <li className="people-row endorsement-row">
      <IdentityRow
        name={actor.displayName}
        avatarSrc={actor.avatarUrl}
        href={actorHref(actor)}
        secondary={[handle, row.note].filter(Boolean).join(" · ") || undefined}
      />
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
      <EmptyState
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
      <ul className="people-list">
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
      <EmptyState title="No endorsements given yet" description="Accounts you endorse show here." />
    );
  }
  return (
    <>
      <ul className="people-list">
        {page.rows.map((row) => (
          <Row key={row.uri} row={row} action={<Placeholder>Revoke</Placeholder>} />
        ))}
      </ul>
      <More page={page} />
    </>
  );
}

/** The account's lists of endorsements. */
export function EndorsementLists({ lists, more }: { lists: ListCard[]; more: boolean }) {
  return <ListCards kind={ENDORSEMENT_LISTS} lists={lists} more={more} />;
}

const ENDORSEMENT_LISTS = LIST_KINDS.find((kind) => kind.label === "Endorsements") as ListKind;

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
