import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { PageHeader } from "@/components/page-title";
import { ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import {
  personalSettingsAccess,
  SettingsAccessFallback,
  SettingsCardsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsHashRedirect } from "@/components/settings/settings-hash-redirect";
import { groupSettingsHref } from "@/lib/routes";
import { signInHref } from "@/lib/validate";

export const metadata: Metadata = {
  title: { default: "Settings", template: "%s · Settings | Certified" },
  robots: { index: false },
};

const PERSONAL_TABS = [
  { label: "Account", href: "/settings" },
  { label: "Appearance", href: "/settings/appearance" },
  { label: "Social graph", href: "/settings/social-graph" },
  { label: "App passwords", href: "/settings/app-passwords" },
  { label: "Groups", href: "/settings/groups" },
];

const LEGACY_HASHES: Readonly<Record<string, string>> = {
  appearance: "/settings/appearance",
  theme: "/settings/appearance",
  "social-graph": "/settings/social-graph",
  "bluesky-follows": "/settings/social-graph",
  "app-passwords": "/settings/app-passwords",
  group: "/settings/groups",
  groups: "/settings/groups",
};

async function PersonalSettingsGate({ children }: { children: ReactNode }) {
  const access = await personalSettingsAccess();
  if (access.status === "signed-out") redirect(signInHref("/settings"));
  if (access.status === "self-group") redirect(groupSettingsHref(access.did));
  if (access.status !== "ok") {
    return <SettingsAccessFallback kind={access.status} path="/settings" />;
  }
  return (
    <div className="page">
      <PageHeader title="Settings" description="Your account on Certified." />
      <SettingsHashRedirect routes={LEGACY_HASHES} />
      <ProfileTabs label="Settings sections" tabs={PERSONAL_TABS} />
      {children}
    </div>
  );
}

function PersonalSettingsShell() {
  return (
    <div className="page">
      <PageHeader title="Settings" description="Your account on Certified." />
      <ProfileTabsSkeleton labels={PERSONAL_TABS.map((t) => t.label)} />
      <SettingsCardsSkeleton count={3} />
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
