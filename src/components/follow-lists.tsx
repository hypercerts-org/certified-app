// Whom an account follows, as its profile and its workspace list them: the
// accounts, then the projects (entity follows), each its own list beneath the
// other. In the workspace (`actingAs`: the account the user acts as, when
// that is the workspace's), each row has the Following button, which
// unfollows.

import { Heading, IdentityLink } from "@hypercerts-org/ui-react";
import { Users } from "lucide-react";
import { actorHref, identityOf } from "@/components/actor";
import { Empty } from "@/components/empty";
import { PeopleList, PeopleRows } from "@/components/people-list";
import { FollowControl } from "@/components/profile-actions";
import { ProjectRow } from "@/components/records";
import type { PeoplePage, ProjectFollowRow } from "@/lib/hypercerts/queries";

/** The projects an account follows, as rows: each with its author, and Following to unfollow. */
export function FollowedProjects({
  rows,
  actingAs,
  path,
}: {
  rows: ProjectFollowRow[];
  actingAs?: string | null;
  path: string;
}) {
  return (
    <ul className="people-list divided">
      {rows.map((row) => (
        <li key={row.follow.uri} className="people-row">
          <ProjectRow
            project={row.project}
            end={
              <>
                <IdentityLink
                  {...identityOf(row.author)}
                  href={actorHref(row.author)}
                  className="list-item-who"
                />
                {actingAs && (
                  <FollowControl
                    subject={row.project.uri}
                    path={path}
                    actor={actingAs}
                    follow={row.follow}
                  />
                )}
              </>
            }
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Accounts, then projects. With nothing followed at all, one empty state;
 * otherwise each kind under its heading when both are there.
 */
export function FollowingLists({
  accounts,
  projects,
  actingAs,
  path,
}: {
  accounts: PeoplePage;
  projects: { rows: ProjectFollowRow[]; more: boolean };
  actingAs?: string | null;
  path: string;
}) {
  if (accounts.rows.length === 0 && projects.rows.length === 0) {
    return <Empty icon={Users} title="No accounts or projects followed yet" />;
  }
  const both = accounts.rows.length > 0 && projects.rows.length > 0;
  return (
    <div className="following-lists">
      {accounts.rows.length > 0 && (
        <section className="following-list" aria-labelledby="following-accounts">
          {both && (
            <Heading level={2} size="heading" id="following-accounts">
              Accounts
            </Heading>
          )}
          {actingAs ? (
            <PeopleRows
              rows={accounts.rows}
              action={(row) => (
                <FollowControl
                  subject={row.actor.did}
                  path={path}
                  actor={actingAs}
                  follow={row.follow ?? null}
                />
              )}
            />
          ) : (
            <PeopleList page={accounts} empty="No accounts followed yet" />
          )}
        </section>
      )}
      {projects.rows.length > 0 && (
        <section className="following-list" aria-labelledby="following-projects">
          {both && (
            <Heading level={2} size="heading" id="following-projects">
              Projects
            </Heading>
          )}
          <FollowedProjects rows={projects.rows} actingAs={actingAs} path={path} />
        </section>
      )}
    </div>
  );
}
