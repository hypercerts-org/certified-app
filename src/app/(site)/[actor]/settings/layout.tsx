import { Button } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { actorHref, workspaceHref } from "@/components/cards";
import { type ProfileTab, ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import {
  groupSettingsAccess,
  loadGroupIdentity,
  ROLE_PHRASE,
  resolveGroupParam,
  SettingsAccessFallback,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsHashRedirect } from "@/components/settings/settings-hash-redirect";
import { SettingsHeader, SettingsHeaderSkeleton } from "@/components/settings/settings-header";
import { signInHref } from "@/lib/validate";

export const metadata: Metadata = {
  title: { default: "Group settings", template: "%s · Group settings | Certified" },
  robots: { index: false },
};

async function GroupSettingsGate({
  params,
  children,
}: {
  params: Promise<{ actor: string }>;
  children: ReactNode;
}) {
  const { actor: address } = await params;
  const groupDid = await resolveGroupParam(address);
  // The tabs under the address this page was opened at (its DID, or its
  // handle), so the open tab shows as selected either way.
  const base = `/${address}/settings`;
  const access = await groupSettingsAccess(groupDid);

  if (access.status === "signed-out") redirect(signInHref(base));
  if (access.status === "personal-account") redirect("/settings");
  if (access.status !== "ok") {
    return <SettingsAccessFallback kind={access.status} path={base} groupDid={groupDid} />;
  }

  const { name, handle, actor } = await loadGroupIdentity(groupDid);
  const canEditProfile = access.isAdmin || access.isSelfOwned;

  const tabs: ProfileTab[] = [
    { label: "Account", href: base },
    ...(canEditProfile ? [{ label: "Profile", href: `${base}/profile` }] : []),
    { label: "Social graph", href: `${base}/social-graph` },
    { label: "Activity log", href: `${base}/activity` },
    ...(access.isSelfOwned ? [{ label: "Appearance", href: `${base}/appearance` }] : []),
  ];

  const legacyHashes: Record<string, string> = {
    ...(canEditProfile ? { profile: `${base}/profile` } : {}),
    "social-graph": `${base}/social-graph`,
    activity: `${base}/activity`,
    ...(access.isSelfOwned
      ? { appearance: `${base}/appearance`, theme: `${base}/appearance` }
      : {}),
  };

  const avatarActor = {
    did: groupDid,
    handle,
    displayName: actor?.displayName ?? name,
    avatarUrl: actor?.avatarUrl ?? null,
    isOrganization: true,
  };

  return (
    <div className="page">
      <SettingsHeader
        title="Group settings"
        actor={avatarActor}
        note={ROLE_PHRASE[access.role] ?? "You belong to this group."}
        actions={
          <>
            <Button href={actorHref(actor ?? groupDid)} variant="secondary" size="sm">
              View profile
            </Button>
            <Button href={workspaceHref(groupDid)} variant="secondary" size="sm">
              Open workspace
            </Button>
          </>
        }
      />
      <SettingsHashRedirect routes={legacyHashes} />
      <ProfileTabs label="Group settings sections" tabs={tabs} />
      {children}
    </div>
  );
}

function GroupSettingsShell() {
  return (
    <div className="page">
      <SettingsHeaderSkeleton title="Group settings" />
      <ProfileTabsSkeleton labels={["Account", "Profile", "Social graph", "Activity log"]} />
      <SettingsRowsSkeleton rows={4} />
    </div>
  );
}

export default function GroupSettingsLayout({
  children,
  params,
}: LayoutProps<"/[actor]/settings">) {
  return (
    <Suspense fallback={<GroupSettingsShell />}>
      <GroupSettingsGate params={params}>{children}</GroupSettingsGate>
    </Suspense>
  );
}
