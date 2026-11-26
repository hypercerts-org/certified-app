import { Button } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { PageHeader } from "@/components/page-title";
import { type ProfileTab, ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import {
  groupSettingsAccess,
  loadGroupIdentity,
  loadOwnershipTransfer,
  ROLE_PHRASE,
  resolveGroupParam,
  SettingsAccessFallback,
  SettingsCardsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsHashRedirect } from "@/components/settings/settings-hash-redirect";
import { groupSettingsHref } from "@/lib/routes";
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
  const groupDid = await resolveGroupParam((await params).actor);
  const base = groupSettingsHref(groupDid);
  const access = await groupSettingsAccess(groupDid);

  if (access.status === "signed-out") redirect(signInHref(base));
  if (access.status === "personal-account") redirect("/settings");
  if (access.status !== "ok") {
    return <SettingsAccessFallback kind={access.status} path={base} groupDid={groupDid} />;
  }

  const [{ name }, transfer] = await Promise.all([
    loadGroupIdentity(groupDid),
    loadOwnershipTransfer(access.session, groupDid),
  ]);

  const showOwnership =
    access.isOwner || Boolean(transfer?.pending && transfer.proposedOwner === access.user.did);

  const tabs: ProfileTab[] = [
    { label: "Account", href: base },
    ...(access.isSelfOwned ? [{ label: "Appearance", href: `${base}/appearance` }] : []),
    { label: "Social graph", href: `${base}/social-graph` },
    { label: "Members and roles", href: `${base}/members` },
    ...(showOwnership ? [{ label: "Transfer ownership", href: `${base}/ownership` }] : []),
    { label: "Activity log", href: `${base}/activity` },
    ...(access.isOwner ? [{ label: "Group status", href: `${base}/status` }] : []),
  ];

  const legacyHashes: Record<string, string> = {
    "social-graph": `${base}/social-graph`,
    members: `${base}/members`,
    activity: `${base}/activity`,
    ...(access.isSelfOwned
      ? { appearance: `${base}/appearance`, theme: `${base}/appearance` }
      : {}),
    ...(showOwnership ? { ownership: `${base}/ownership` } : {}),
    ...(access.isOwner ? { status: `${base}/status`, danger: `${base}/status` } : {}),
  };

  return (
    <div className="page">
      <PageHeader
        title={access.isSelfOwned ? "Settings" : `${name} settings`}
        description={ROLE_PHRASE[access.role] ?? "You belong to this group."}
        actions={
          <Button href={workspaceHref(groupDid)} variant="secondary" size="sm">
            Open workspace
          </Button>
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
      <PageHeader title="Group settings" />
      <ProfileTabsSkeleton
        labels={["Account", "Social graph", "Members and roles", "Activity log"]}
      />
      <SettingsCardsSkeleton count={3} />
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
