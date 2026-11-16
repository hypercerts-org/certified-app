import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Heading,
  IdentityRow,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { actorHref, workspaceHref } from "@/components/cards";
import { SignInAgain } from "@/components/sign-out-form";
import { getUser, readOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { getActor } from "@/lib/hypercerts/queries";
import { logError } from "@/lib/log";
import { listOrganizations, type Organization } from "@/lib/organizations";
import { isDid, signInHref } from "@/lib/validate";

export const metadata: Metadata = { title: "Workspace", robots: { index: false } };

// A workspace is what one account holds and what you manage for it: your own,
// or an organization's you belong to. Which one is named in the URL, never
// stored in the session, so tabs can't disagree about whom they act for.

function WorkspaceHeader({
  name,
  avatarUrl,
  kind,
}: {
  name: string;
  avatarUrl: string | null;
  kind: string;
}) {
  return (
    <div className="workspace-header">
      <Avatar name={name} src={avatarUrl} size="lg" />
      <div className="workspace-title">
        <Heading level={1} size="display-3">
          {name}
        </Heading>
        <Text tone="muted">{kind}</Text>
      </div>
    </div>
  );
}

function ProfileSection({ did, canEdit }: { did: string; canEdit: boolean }) {
  return (
    <section className="stack">
      <Heading level={2} size="heading">
        Profile
      </Heading>
      <div className="actions">
        <Button href={actorHref(did)} variant="secondary" size="sm">
          View profile
        </Button>
        {canEdit && (
          <Button href={`${actorHref(did)}/edit`} variant="secondary" size="sm">
            Edit profile
          </Button>
        )}
      </div>
    </section>
  );
}

function OrganizationsSection({ organizations }: { organizations: Organization[] }) {
  return (
    <section className="stack">
      <Heading level={2} size="heading">
        Organizations
      </Heading>
      {organizations.length === 0 ? (
        <EmptyState title="You don't belong to any organization yet" />
      ) : (
        <ul className="grid">
          {organizations.map((organization) => (
            <Card as="li" variant="panel" className="card" key={organization.did}>
              <IdentityRow
                name={organization.name}
                avatarSrc={organization.avatarUrl}
                href={workspaceHref(organization.did)}
                secondary={organization.roleLabel}
              />
            </Card>
          ))}
        </ul>
      )}
    </section>
  );
}

async function Workspace({ params }: Pick<PageProps<"/[actor]/workspace">, "params">) {
  const did = decodeURIComponent((await params).actor);
  if (!isDid(did)) notFound();
  const here = workspaceHref(did);
  const user = await getUser();
  if (!user) redirect(signInHref(here));

  try {
    const session = await readOAuthSession();
    if (session === null || session === "expired") {
      return (
        <SignInAgain path={here}>
          Your sign-in has expired. Sign in again to open this workspace.
        </SignInAgain>
      );
    }
    const [actor, organizations] = await Promise.all([getActor(did), listOrganizations(session)]);

    if (did === user.did) {
      return (
        <>
          <WorkspaceHeader
            name={actor?.displayName ?? did}
            avatarUrl={actor?.avatarUrl ?? null}
            kind="Personal workspace"
          />
          <ProfileSection did={did} canEdit />
          <OrganizationsSection organizations={organizations} />
        </>
      );
    }

    const organization = organizations.find((o) => o.did === did);
    if (!organization) {
      return (
        <Text>
          This isn't one of your workspaces. You can open your own and those of the organizations
          you belong to.
        </Text>
      );
    }
    return (
      <>
        <WorkspaceHeader
          name={organization.name}
          avatarUrl={organization.avatarUrl}
          kind={`Organization workspace · ${organization.roleLabel}`}
        />
        <ProfileSection did={did} canEdit={organization.manages} />
      </>
    );
  } catch (err) {
    if (!(err instanceof SessionUnavailableError))
      logError("[workspace] load failed", err, { did });
    return (
      <Text tone="muted">This workspace can't be loaded right now. Please try again shortly.</Text>
    );
  }
}

export default function WorkspacePage(props: PageProps<"/[actor]/workspace">) {
  return (
    <div className="page">
      <Suspense fallback={<Skeleton variant="text" lines={4} />}>
        <Workspace params={props.params} />
      </Suspense>
    </div>
  );
}
