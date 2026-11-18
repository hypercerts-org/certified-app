import { Text } from "@hypercerts-org/ui-react";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { workspaceHref } from "@/components/cards";
import { SignInAgain } from "@/components/sign-out-form";
import { getUser, SessionUnavailableError } from "@/lib/auth/dal";
import { logError } from "@/lib/log";
import { getMemberships } from "@/lib/memberships";
import { isDid, signInHref } from "@/lib/validate";

// Who may open a workspace. The check sits in the workspace's layout, which
// Next.js renders once and keeps while you move between the workspace's
// pages: entering it checks, switching its pages and tabs doesn't. The pages
// hold only public data about the account, cached, so their links prefetch
// them.
//
// Your own workspace opens at once: the signed-in account is part of the
// cached page per session. So are your memberships (memberships.ts), which
// say whether an organization's workspace is one of yours.

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

  // Your memberships, remembered per session (memberships.ts): entering an
  // organization's workspace costs no OAuth restore or CGS call.
  let memberships: Awaited<ReturnType<typeof getMemberships>>;
  try {
    memberships = await getMemberships();
  } catch (err) {
    return <Unavailable did={did} err={err} />;
  }
  if (memberships === null) redirect(signInHref(workspaceHref(did)));
  if (memberships === "expired") {
    return (
      <SignInAgain path={workspaceHref(did)}>
        Your sign-in has expired. Sign in again to open this workspace.
      </SignInAgain>
    );
  }
  if (!memberships.some((m) => m.groupDid === did)) {
    return (
      <Text>
        This isn't one of your workspaces. You can open your own and those of the organizations you
        belong to.
      </Text>
    );
  }
  return children;
}

function Unavailable({ did, err }: { did: string; err: unknown }) {
  if (!(err instanceof SessionUnavailableError)) logError("[workspace] load failed", err, { did });
  return (
    <Text tone="muted">This workspace can't be loaded right now. Please try again shortly.</Text>
  );
}
