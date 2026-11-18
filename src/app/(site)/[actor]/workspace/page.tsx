import type { OAuthSession } from "@atproto/oauth-client-node";
import { Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { SignInAgain } from "@/components/sign-out-form";
import {
  OrganizationsSection,
  OrganizationsSkeleton,
  OverviewSkeleton,
  WorkspaceOverview,
} from "@/components/workspace-overview";
import { getUser, readOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { logError } from "@/lib/log";
import { listOrganizations } from "@/lib/organizations";
import { isDid, signInHref } from "@/lib/validate";

export const metadata: Metadata = { title: "Workspace", robots: { index: false } };

// A workspace is what one account holds and what you manage for it: your own,
// or that of an organization you belong to. The URL names which; `/workspace`
// opens the one you act as.
//
// Most of the overview is public data about the account, cached and shared
// (its records, endorsements, followers, profile), so a link prefetches it and
// the page shows at once. Only what needs your OAuth session waits for it:
// your organizations, and whether an organization's workspace is one of
// yours.

async function Workspace({ params }: Pick<PageProps<"/[actor]/workspace">, "params">) {
  const did = decodeURIComponent((await params).actor);
  if (!isDid(did)) notFound();
  const user = await getUser();
  if (!user) redirect(signInHref(workspaceHref(did)));

  if (did === user.did) {
    return (
      <WorkspaceOverview
        did={did}
        canEdit
        organizations={
          <Suspense fallback={<OrganizationsSkeleton />}>
            <YourOrganizations did={did} />
          </Suspense>
        }
      />
    );
  }
  return <OrganizationWorkspace did={did} />;
}

/** Runs `load` with your OAuth session, or explains why it can't. */
async function withSession(did: string, load: (session: OAuthSession) => Promise<ReactNode>) {
  const here = workspaceHref(did);
  let session: Awaited<ReturnType<typeof readOAuthSession>>;
  try {
    session = await readOAuthSession();
  } catch (err) {
    return <Unavailable did={did} err={err} />;
  }
  // Outside the try: redirect() throws.
  if (session === null) redirect(signInHref(here));
  if (session === "expired") {
    return (
      <SignInAgain path={here}>
        Your sign-in has expired. Sign in again to open this workspace.
      </SignInAgain>
    );
  }
  try {
    return await load(session);
  } catch (err) {
    return <Unavailable did={did} err={err} />;
  }
}

function Unavailable({ did, err }: { did: string; err: unknown }) {
  if (!(err instanceof SessionUnavailableError)) logError("[workspace] load failed", err, { did });
  return (
    <Text tone="muted">This workspace can't be loaded right now. Please try again shortly.</Text>
  );
}

async function YourOrganizations({ did }: { did: string }) {
  return withSession(did, async (session) => (
    <OrganizationsSection organizations={await listOrganizations(session)} />
  ));
}

/** An organization's workspace, once your memberships show it is one of yours. */
async function OrganizationWorkspace({ did }: { did: string }) {
  return withSession(did, async (session) => {
    const organization = (await listOrganizations(session)).find((o) => o.did === did);
    if (!organization) {
      return (
        <Text>
          This isn't one of your workspaces. You can open your own and those of the organizations
          you belong to.
        </Text>
      );
    }
    return <WorkspaceOverview did={did} canEdit={organization.manages} organizations={null} />;
  });
}

export default function WorkspacePage(props: PageProps<"/[actor]/workspace">) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Workspace params={props.params} />
    </Suspense>
  );
}
