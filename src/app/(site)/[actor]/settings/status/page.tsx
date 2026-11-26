import { Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { GroupStatusSection } from "@/components/settings/group-sections";
import {
  loadGroupIdentity,
  requireGroupSettings,
  SettingsCardsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsCard, SettingsSection } from "@/components/settings/settings-frame";

export const metadata: Metadata = { title: "Group status" };

async function GroupStatus({ params }: { params: Promise<{ actor: string }> }) {
  const access = await requireGroupSettings(params, "/status");
  if (!access) return null;

  if (!access.isOwner) {
    return (
      <SettingsSection description="Whether this account is a group. Only the owner can change it.">
        <SettingsCard title="Group status">
          <Text size="body-sm" tone="muted">
            Only the group&apos;s owner can change its group status.
          </Text>
        </SettingsCard>
      </SettingsSection>
    );
  }

  const { name, handle } = await loadGroupIdentity(access.groupDid);

  return (
    <SettingsSection description="Whether this account is a group. Only the owner can change it.">
      <GroupStatusSection
        groupDid={access.groupDid}
        groupName={name}
        groupHandle={handle}
        isSelfOwned={access.isSelfOwned}
      />
    </SettingsSection>
  );
}

export default function GroupStatusSettingsPage({ params }: PageProps<"/[actor]/settings/status">) {
  return (
    <Suspense fallback={<SettingsCardsSkeleton count={1} />}>
      <GroupStatus params={params} />
    </Suspense>
  );
}
