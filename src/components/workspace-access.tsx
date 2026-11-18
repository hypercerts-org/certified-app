import type { OAuthSession } from "@atproto/oauth-client-node";
import { Text } from "@hypercerts-org/ui-react";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { workspaceHref } from "@/components/cards";
import { SignInAgain } from "@/components/sign-out-form";
import { getUser, readOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { logError } from "@/lib/log";
import { listOrganizations } from "@/lib/organizations";
import { isDid, signInHref } from "@/lib/validate";

// Who may open a workspace, shared by its pages. Your own opens at once: the
// signed-in account is part of the cached page per session, and what a
// workspace shows is public data about the account, cached and prefetched.
// An organization's waits for your OAuth session, to check that you belong
// to it.

export type WorkspaceViewer = {
  did: string;
  /** Your own workspace, not an organization's. */
  own: boolean;
  /** Whether you may edit the account (yours, or one you manage). */
  canEdit: boolean;
};

export async function WorkspaceAccess({
  params,
  section = "",
  children,
}: {
  params: Promise<{ actor: string }>;
  /** The page under the workspace ("/projects"), for sign-in's way back. */
  section?: string;
  children: (viewer: WorkspaceViewer) => ReactNode;
}) {
  const did = decodeURIComponent((await params).actor);
  if (!isDid(did)) notFound();
  const here = `${workspaceHref(did)}${section}`;
  const user = await getUser();
  if (!user) redirect(signInHref(here));
  if (did === user.did) return children({ did, own: true, canEdit: true });

  return withSession(here, did, async (session) => {
    const organization = (await listOrganizations(session)).find((o) => o.did === did);
    if (!organization) {
      return (
        <Text>
          This isn't one of your workspaces. You can open your own and those of the organizations
          you belong to.
        </Text>
      );
    }
    return children({ did, own: false, canEdit: organization.manages });
  });
}

/** Runs `load` with your OAuth session, or explains why it can't. */
export async function withSession(
  here: string,
  did: string,
  load: (session: OAuthSession) => Promise<ReactNode>,
) {
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
