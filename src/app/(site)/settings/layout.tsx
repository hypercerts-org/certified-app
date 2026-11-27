import { Button } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { actorHref } from "@/components/cards";
import { ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import {
  personalSettingsAccess,
  SettingsAccessFallback,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsHashRedirect } from "@/components/settings/settings-hash-redirect";
import { SettingsHeader, SettingsHeaderSkeleton } from "@/components/settings/settings-header";
import { getActorCore } from "@/lib/hypercerts/queries";
import { getHandle } from "@/lib/identity";
import { groupSettingsHref } from "@/lib/routes";
import { signInHref } from "@/lib/validate";

export const ensureStatic = "shell";

export const metadata: Metadata = {
  title: { default: "Settings", template: "%s · Settings | Certified" },
  robots: { index: false },
};

const PERSONAL_TABS = [
  { label: "Account", href: "/settings" },
  { label: "Profile", href: "/settings/profile" },
  { label: "Groups", href: "/settings/groups" },
  { label: "Bluesky sync", href: "/settings/bluesky-sync" },
  { label: "Appearance", href: "/settings/appearance" },
];

const LEGACY_HASHES: Readonly<Record<string, string>> = {
  profile: "/settings/profile",
  appearance: "/settings/appearance",
  theme: "/settings/appearance",
  "social-graph": "/settings/bluesky-sync",
  "bluesky-follows": "/settings/bluesky-sync",
  "app-passwords": "/settings",
  group: "/settings/groups",
  groups: "/settings/groups",
};

async function PersonalSettingsHeader({ did }: { did: string }) {
  const [actor, handle] = await Promise.all([getActorCore(did).catch(() => null), getHandle(did)]);
  const avatarActor = {
    did,
    handle,
    displayName: actor?.displayName ?? "",
    avatarUrl: actor?.avatarUrl ?? null,
    isOrganization: actor?.isOrganization ?? false,
  };
  return (
    <SettingsHeader
      title="Personal settings"
      actor={avatarActor}
      actions={
        <Button href={actorHref({ did, handle })} variant="secondary" size="sm">
          View profile
        </Button>
      }
    />
  );
}

async function PersonalSettingsGate({ children }: { children: ReactNode }) {
  const access = await personalSettingsAccess();
  if (access.status === "signed-out") redirect(signInHref("/settings"));
  if (access.status === "self-group") redirect(groupSettingsHref(access.did));
  if (access.status !== "ok") {
    return <SettingsAccessFallback kind={access.status} path="/settings" />;
  }

  return (
    <div className="page">
      <Suspense fallback={<SettingsHeaderSkeleton title="Personal settings" />}>
        <PersonalSettingsHeader did={access.user.did} />
      </Suspense>
      <SettingsHashRedirect routes={LEGACY_HASHES} />
      <ProfileTabs label="Settings sections" tabs={PERSONAL_TABS} />
      {children}
    </div>
  );
}

function PersonalSettingsShell() {
  return (
    <div className="page">
      <SettingsHeaderSkeleton title="Personal settings" />
      <ProfileTabsSkeleton labels={PERSONAL_TABS.map((t) => t.label)} />
      <SettingsRowsSkeleton rows={5} />
    </div>
  );
}

export default function PersonalSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PersonalSettingsShell />}>
      <PersonalSettingsGate>{children}</PersonalSettingsGate>
    </Suspense>
  );
}
