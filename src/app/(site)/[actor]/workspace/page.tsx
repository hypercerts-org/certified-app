import { Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { SignInAgain } from "@/components/sign-out-form";
import { WorkspaceOverview } from "@/components/workspace-overview";
import { getUser, readOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { getActor } from "@/lib/hypercerts/queries";
import { getHandle } from "@/lib/identity";
import { logError } from "@/lib/log";
import { listOrganizations } from "@/lib/organizations";
import { isDid, signInHref } from "@/lib/validate";

export const metadata: Metadata = { title: "Workspace", robots: { index: false } };

// A workspace is what one account holds and what you manage for it: your own,
// or that of an organization you belong to. The URL names which; `/workspace`
// opens the one you act as.

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
    const [actor, handle, organizations] = await Promise.all([
      getActor(did),
      getHandle(did),
      listOrganizations(session),
    ]);

    if (did === user.did) {
      return (
        <WorkspaceOverview
          account={{ did, actor, handle, canEdit: true }}
          organizations={organizations}
        />
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
      <WorkspaceOverview
        account={{ did, actor, handle, canEdit: organization.manages }}
        organizations={null}
      />
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
    <Suspense fallback={<Skeleton variant="text" lines={6} />}>
      <Workspace params={props.params} />
    </Suspense>
  );
}
