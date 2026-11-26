// A workspace's endorsements, after the staging redesign's Workspace →
// Endorsements: received (hidden ones included, tagged, with Hide/Show
// actions), given (with Revoke), and the endorsement lists the account keeps.

import { Badge, Button, Text } from "@hypercerts-org/ui-react";
import { ListChecks, ThumbsUp } from "lucide-react";
import type { ReactNode } from "react";
import { ActorRow } from "@/components/actor";
import { actorHref } from "@/components/cards";
import { Empty } from "@/components/empty";
import {
  EndorsementVisibilityButton,
  EndorseSomeoneDialog,
  GivenEndorsementRows,
  RevokeEndorsementButton,
} from "@/components/endorsement-controls";
import { PeopleListSkeleton } from "@/components/people-list";
import { ListGroups } from "@/components/profile-lists";
import type { PeoplePage } from "@/lib/hypercerts/queries";
import { endorsementLine, type ListCard, nameOf, type PersonRow } from "@/lib/hypercerts/views";

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

function More({ page }: { page: PeoplePage }) {
  return page.more ? (
    <Text size="body-sm" tone="muted">
      Showing the latest {page.rows.length}.
    </Text>
  ) : null;
}

/** Endorsements others gave the account, hidden ones tagged. */
export function ReceivedEndorsements({
  repo,
  page,
  profile,
}: {
  repo: string;
  page: PeoplePage;
  profile: string;
}) {
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
            action={
              <EndorsementVisibilityButton
                repo={repo}
                awardUri={row.uri}
                renderedHidden={Boolean(row.hidden)}
              />
            }
          />
        ))}
      </ul>
      <More page={page} />
    </>
  );
}

/** Endorsements the account gave, each row going as soon as it is revoked. */
export function GivenEndorsements({ repo, page }: { repo: string; page: PeoplePage }) {
  const empty = (
    <Empty
      icon={ThumbsUp}
      title="No endorsements given yet"
      description="Accounts you endorse show here."
    />
  );
  if (page.rows.length === 0) return empty;
  return (
    <>
      <GivenEndorsementRows
        empty={empty}
        rows={page.rows.map((row) => ({
          uri: row.uri,
          row: (
            <Row
              key={row.uri}
              row={row}
              action={
                <RevokeEndorsementButton
                  repo={repo}
                  awardUri={row.uri}
                  subjectDid={row.actor.did}
                  subjectName={nameOf(row.actor)}
                />
              }
            />
          ),
        }))}
      />
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

/** "Endorse someone": opens a dialog to endorse an account from `repo`. */
export function EndorseSomeone({ repo }: { repo: string }) {
  return <EndorseSomeoneDialog repo={repo} />;
}
