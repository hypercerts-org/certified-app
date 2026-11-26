import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportAsGroupSection } from "@/components/settings/import-as-group-section";
import {
  readPersonalAccountDetails,
  requirePersonalSettings,
  SettingsCardsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsSection } from "@/components/settings/settings-frame";

export const metadata: Metadata = { title: "Groups" };

async function PersonalGroups() {
  const access = await requirePersonalSettings("/settings/groups");
  if (!access) return null;
  const { handle } = await readPersonalAccountDetails(access.session, access.user.did);
  return (
    <SettingsSection description="Create a new shared group alongside your account, or turn this account into a group that several people can manage.">
      <ImportAsGroupSection did={access.user.did} handle={handle} pdsDomain={access.pdsDomain} />
    </SettingsSection>
  );
}

export default function PersonalGroupsSettingsPage() {
  return (
    <Suspense fallback={<SettingsCardsSkeleton count={2} />}>
      <PersonalGroups />
    </Suspense>
  );
}
