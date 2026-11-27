import type { l } from "@atproto/lex";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { Button, Text } from "@hypercerts-org/ui-react";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { actorHref } from "@/components/cards";
import { PageHeader } from "@/components/page-title";
import { SignInAgain } from "@/components/sign-out-form";
import { CERTIFIED_PDS_URL } from "@/lib/auth/config";
import { getUser, readOAuthSession, SessionUnavailableError, type User } from "@/lib/auth/dal";
import { callOAuthPds } from "@/lib/auth/elevated-session";
import {
  getOwnershipTransferStatus,
  type Membership,
  type OwnershipTransferStatus,
} from "@/lib/cgs";
import { getActorCards, getActorCore } from "@/lib/hypercerts/queries";
import { type ActorCard, nameOf } from "@/lib/hypercerts/views";
import { getDid, getHandle } from "@/lib/identity";
import { logError } from "@/lib/log";
import { getGroupMembers, getMemberships } from "@/lib/memberships";
import { groupSettingsHref } from "@/lib/routes";
import { isDid, signInHref } from "@/lib/validate";

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const ROLE_ORDER: Record<string, number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

export const ROLE_PHRASE: Record<string, string> = {
  owner: "You're the owner.",
  admin: "You're an admin.",
  member: "You're a member.",
};

export type GroupMemberRow = {
  actor: ActorCard;
  role: string;
  roleLabel: string;
};

export type PersonalAccess =
  | {
      status: "ok";
      user: User;
      session: OAuthSession;
      pdsDomain: string;
    }
  | { status: "self-group"; did: string }
  | { status: "signed-out" }
  | { status: "expired" }
  | { status: "unavailable" };

/**
 * Access decision for `/settings/*`, cached per request so layout and leaf
 * pages share one check. If the signed-in account is itself a CGS group,
 * returns `self-group` so callers redirect to `/{did}/settings`.
 */
export const personalSettingsAccess = cache(async (): Promise<PersonalAccess> => {
  const user = await getUser();
  if (!user) return { status: "signed-out" };

  let session: Awaited<ReturnType<typeof readOAuthSession>>;
  try {
    session = await readOAuthSession();
  } catch (err) {
    unstable_rethrow(err);
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] session restore failed", err);
    }
    return { status: "unavailable" };
  }
  if (!session) return { status: "signed-out" };
  if (session === "expired") return { status: "expired" };

  const memberships = await getMemberships().catch((err) => {
    unstable_rethrow(err);
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] memberships failed", err);
    }
    return null;
  });
  if (Array.isArray(memberships) && memberships.some((m) => m.groupDid === user.did)) {
    return { status: "self-group", did: user.did };
  }

  return {
    status: "ok",
    user,
    session,
    pdsDomain: new URL(CERTIFIED_PDS_URL).hostname,
  };
});

/**
 * Gate for `/settings/*` leaf pages: redirects signed-out or self-owned-group
 * callers, and returns `null` when the layout already renders the expired or
 * unavailable state.
 */
export async function requirePersonalSettings(
  path = "/settings",
): Promise<Extract<PersonalAccess, { status: "ok" }> | null> {
  const access = await personalSettingsAccess();
  if (access.status === "signed-out") redirect(signInHref(path));
  if (access.status === "self-group") {
    const suffix = path === "/settings" ? "" : path.slice("/settings".length);
    const groupTarget =
      suffix === "/profile" || suffix === "/appearance" || suffix === "/bluesky-sync"
        ? `${groupSettingsHref(access.did)}${suffix}`
        : groupSettingsHref(access.did);
    redirect(groupTarget);
  }
  return access.status === "ok" ? access : null;
}

/** Reads the signed-in account's verified handle and PDS session email (best-effort). */
export const readPersonalAccountDetails = cache(async (session: OAuthSession, did: string) => {
  const [resolvedHandle, sessionInfo] = await Promise.all([
    getHandle(did),
    callOAuthPds(session, "com.atproto.server.getSession")
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as {
          handle?: string;
          email?: string;
          emailConfirmed?: boolean;
        };
      })
      .catch(() => null),
  ]);
  return {
    handle:
      (typeof sessionInfo?.handle === "string" && sessionInfo.handle) || resolvedHandle || null,
    email: typeof sessionInfo?.email === "string" ? sessionInfo.email : null,
    emailConfirmed: sessionInfo?.emailConfirmed ?? true,
  };
});

// ---------------------------------------------------------------------------
// Group Settings Access (`/[actor]/settings/*`)
// ---------------------------------------------------------------------------

export async function resolveGroupParam(rawParam: string): Promise<l.DidString> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawParam);
  } catch {
    notFound();
  }
  if (isDid(decoded)) return decoded as l.DidString;
  const resolved = await getDid(decoded);
  if (!resolved || !isDid(resolved)) notFound();
  return resolved as l.DidString;
}

export type GroupAccess =
  | {
      status: "ok";
      groupDid: l.DidString;
      user: User;
      session: OAuthSession;
      membership: Membership;
      role: string;
      isOwner: boolean;
      isAdmin: boolean;
      isSelfOwned: boolean;
      pdsDomain: string;
    }
  | { status: "personal-account" }
  | { status: "signed-out"; groupDid: l.DidString }
  | { status: "expired"; groupDid: l.DidString }
  | { status: "not-member"; groupDid: l.DidString }
  | { status: "unavailable"; groupDid: l.DidString };

/**
 * Access decision for `/[actor]/settings/*`, cached per request so the layout
 * and every sub-page share one membership/session check.
 */
export const groupSettingsAccess = cache(async (groupDid: l.DidString): Promise<GroupAccess> => {
  const user = await getUser();
  if (!user) return { status: "signed-out", groupDid };

  let session: Awaited<ReturnType<typeof readOAuthSession>>;
  try {
    session = await readOAuthSession();
  } catch (err) {
    unstable_rethrow(err);
    if (!(err instanceof SessionUnavailableError)) {
      logError("[group-settings] session restore failed", err, { groupDid });
    }
    return { status: "unavailable", groupDid };
  }
  if (!session) return { status: "signed-out", groupDid };
  if (session === "expired") return { status: "expired", groupDid };

  let memberships: Awaited<ReturnType<typeof getMemberships>>;
  try {
    memberships = await getMemberships();
  } catch (err) {
    unstable_rethrow(err);
    if (!(err instanceof SessionUnavailableError)) {
      logError("[group-settings] memberships failed", err, { groupDid });
    }
    return { status: "unavailable", groupDid };
  }
  if (memberships === "expired") return { status: "expired", groupDid };

  const membership = Array.isArray(memberships)
    ? memberships.find((m) => m.groupDid === groupDid)
    : undefined;
  const isSelfOwned = groupDid === user.did;
  if (!membership) {
    return isSelfOwned ? { status: "personal-account" } : { status: "not-member", groupDid };
  }

  return {
    status: "ok",
    groupDid,
    user,
    session,
    membership,
    role: membership.role,
    isOwner: membership.role === "owner",
    isAdmin: membership.role === "owner" || membership.role === "admin",
    isSelfOwned,
    pdsDomain: new URL(CERTIFIED_PDS_URL).hostname,
  };
});

/**
 * Gate for `/[actor]/settings/*` leaf pages: verifies membership independently
 * of the layout (layouts never stop leaf data from rendering into a response).
 */
export async function requireGroupSettings(
  params: Promise<{ actor: string }>,
  subpath = "",
): Promise<Extract<GroupAccess, { status: "ok" }> | null> {
  const groupDid = await resolveGroupParam((await params).actor);
  const access = await groupSettingsAccess(groupDid);
  if (access.status === "signed-out") {
    redirect(signInHref(`${groupSettingsHref(groupDid)}${subpath}`));
  }
  if (access.status === "personal-account") redirect("/settings");
  return access.status === "ok" ? access : null;
}

/** Group display name, verified handle, and actor detail, cached per request. */
export const loadGroupIdentity = cache(async (groupDid: l.DidString) => {
  const [actor, handle] = await Promise.all([
    getActorCore(groupDid).catch(() => null),
    getHandle(groupDid),
  ]);
  const name = actor ? nameOf({ ...actor, handle }) : handle ? `@${handle}` : groupDid;
  return { name, handle, actor: actor ? { ...actor, handle } : null };
});

/** Group members with resolved actor cards, sorted Owner → Admin → Member. */
export const loadGroupMembers = cache(async (groupDid: l.DidString): Promise<GroupMemberRow[]> => {
  const raw = await getGroupMembers(groupDid).catch((err) => {
    unstable_rethrow(err);
    logError("[group-settings] members failed", err, { groupDid });
    return null;
  });
  const list = Array.isArray(raw) ? raw : [];
  const cards = new Map((await getActorCards(list.map((m) => m.did))).map((c) => [c.did, c]));
  return list
    .map((member) => ({
      actor: cards.get(member.did) ?? {
        did: member.did,
        handle: null,
        displayName: member.did,
        description: null,
        avatarUrl: null,
        isOrganization: false,
      },
      role: member.role,
      roleLabel: ROLE_LABEL[member.role] ?? member.role,
    }))
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
});

/** Pending ownership transfer status for `groupDid`, cached per request. */
export const loadOwnershipTransfer = cache(
  async (session: OAuthSession, groupDid: l.DidString): Promise<OwnershipTransferStatus | null> =>
    getOwnershipTransferStatus(session, groupDid).catch(() => null),
);

/** Shared fallback view for expired, unavailable, or non-member states in settings layouts. */
export function SettingsAccessFallback({
  kind,
  path,
  groupDid,
}: {
  kind: "expired" | "unavailable" | "not-member";
  path: string;
  groupDid?: string;
}) {
  const title = groupDid ? "Group settings" : "Settings";
  if (kind === "expired") {
    return (
      <div className="page">
        <PageHeader title={title} />
        <SignInAgain path={path}>
          Your sign-in has expired. Sign in again to open settings.
        </SignInAgain>
      </div>
    );
  }
  if (kind === "not-member" && groupDid) {
    return (
      <div className="page">
        <PageHeader
          title="Group settings"
          description="Group settings are open to this group's members."
          actions={
            <Button href={actorHref(groupDid)} variant="secondary" size="sm">
              View profile
            </Button>
          }
        />
        <Text tone="muted">
          You don&apos;t belong to this group, so you can&apos;t view or change its settings.
        </Text>
      </div>
    );
  }
  return (
    <div className="page">
      <PageHeader title={title} />
      <Text tone="muted">Settings can&apos;t be loaded right now. Please try again shortly.</Text>
    </div>
  );
}

export { SettingsRowsSkeleton } from "./settings-frame";
