import { Text } from "@hypercerts-org/ui-react";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { cache, type ReactNode } from "react";
import { workspaceHref } from "@/components/cards";
import { SignInAgain } from "@/components/sign-out-form";
import { getUser, SessionUnavailableError } from "@/lib/auth/dal";
import { logError } from "@/lib/log";
import { getMemberships } from "@/lib/memberships";
import { isDid, signInHref } from "@/lib/validate";

// Who may open a workspace: your own, or an organization's you belong to.
// One decision per request (workspaceAccess), read twice:
//
// - The workspace layout shows what to do instead (sign in, sign in again,
//   "not one of your workspaces").
// - Every workspace page reads its account through workspaceDid() and renders
//   nothing unless access is granted. A layout alone doesn't stop the pages
//   below it from rendering into the response (Next.js authentication
//   guide), so a page holding private data must never rely on it.
//
// Cheap to ask: the signed-in user and the memberships are cached per session
// (dal.ts, memberships.ts), so a workspace prefetches like any page.

type Access = "granted" | "signed-out" | "expired" | "not-member" | "unavailable";

const workspaceAccess = cache(async (did: string): Promise<Access> => {
  const user = await getUser();
  if (!user) return "signed-out";
  if (did === user.did) return "granted";
  try {
    const memberships = await getMemberships();
    if (memberships === null) return "signed-out";
    if (memberships === "expired") return "expired";
    return memberships.some((m) => m.groupDid === did) ? "granted" : "not-member";
  } catch (err) {
    unstable_rethrow(err); // Next's own signals (prerendering, redirects) pass through
    if (!(err instanceof SessionUnavailableError))
      logError("[workspace] access failed", err, { did });
    return "unavailable";
  }
});

function didOf(param: string): string {
  const did = decodeURIComponent(param);
  if (!isDid(did)) notFound();
  return did;
}

/**
 * The workspace's account, from the URL, once access is granted; otherwise
 * null, and the page renders nothing (the layout says why).
 */
export async function workspaceDid(params: Promise<{ actor: string }>): Promise<string | null> {
  const did = didOf((await params).actor);
  return (await workspaceAccess(did)) === "granted" ? did : null;
}

/** Whether the workspace is the signed-in account's own (not an organization's). */
export async function isOwnWorkspace(did: string): Promise<boolean> {
  return (await getUser())?.did === did;
}

/** The workspace layout's gate: its pages, or what to do instead. */
export async function WorkspaceAccess({
  params,
  children,
}: {
  params: Promise<{ actor: string }>;
  children: ReactNode;
}) {
  const did = didOf((await params).actor);
  const here = workspaceHref(did);
  switch (await workspaceAccess(did)) {
    case "granted":
      return children;
    case "signed-out":
      return redirect(signInHref(here));
    case "expired":
      return (
        <SignInAgain path={here}>
          Your sign-in has expired. Sign in again to open this workspace.
        </SignInAgain>
      );
    case "not-member":
      return (
        <Text>
          This isn't one of your workspaces. You can open your own and those of the organizations
          you belong to.
        </Text>
      );
    case "unavailable":
      return (
        <Text tone="muted">
          This workspace can't be loaded right now. Please try again shortly.
        </Text>
      );
  }
}
