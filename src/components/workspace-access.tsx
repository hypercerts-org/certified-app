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

// Who may open a workspace. The check sits in the workspace's layout, which
// Next.js renders once and keeps while you move between the workspace's
// pages: entering it checks, switching its pages and tabs doesn't. The pages
// hold only public data about the account, cached, so their links prefetch
// them.
//
// Your own workspace opens at once: the signed-in account is part of the
// cached page per session. An organization's waits for your OAuth session,
// to check that you belong to it.

/** The workspace's account, from the URL. */
export async function workspaceDid(params: Promise<{ actor: string }>): Promise<string> {
  const did = decodeURIComponent((await params).actor);
  if (!isDid(did)) notFound();
  return did;
}

/** Whether the workspace is the signed-in account's own (not an organization's). */
export async function isOwnWorkspace(did: string): Promise<boolean> {
  return (await getUser())?.did === did;
}

export async function WorkspaceAccess({
  params,
  children,
}: {
  params: Promise<{ actor: string }>;
  children: ReactNode;
}) {
  const did = await workspaceDid(params);
  const user = await getUser();
  if (!user) redirect(signInHref(workspaceHref(did)));
  if (did === user.did) return children;

  return withSession(workspaceHref(did), did, async (session) => {
    const organizations = await listOrganizations(session);
    if (!organizations.some((o) => o.did === did)) {
      return (
        <Text>
          This isn't one of your workspaces. You can open your own and those of the organizations
          you belong to.
        </Text>
      );
    }
    return children;
  });
}

/** Shown when you may edit the workspace's account: yours, or an organization you manage. */
export function EditorOnly({ did, children }: { did: string; children: ReactNode }) {
  return <EditorGate did={did}>{children}</EditorGate>;
}

async function EditorGate({ did, children }: { did: string; children: ReactNode }) {
  if (await isOwnWorkspace(did)) return children;
  let session: Awaited<ReturnType<typeof readOAuthSession>>;
  try {
    session = await readOAuthSession();
  } catch {
    return null;
  }
  if (!session || session === "expired") return null;
  const organization = (await listOrganizations(session)).find((o) => o.did === did);
  return organization?.manages ? children : null;
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
