import { Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { GroupOwnershipSection } from "@/components/settings/group-sections";
import {
  loadGroupIdentity,
  loadGroupMembers,
  loadOwnershipTransfer,
  requireGroupSettings,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/settings-frame";

export const metadata: Metadata = { title: "Transfer ownership" };

async function GroupOwnership({ params }: { params: Promise<{ actor: string }> }) {
  const access = await requireGroupSettings(params, "/ownership");
  if (!access) return null;

  const [{ name, handle }, members, transfer] = await Promise.all([
    loadGroupIdentity(access.groupDid),
    loadGroupMembers(access.groupDid),
    loadOwnershipTransfer(access.session, access.groupDid),
  ]);

  const isRecipient = Boolean(transfer?.pending && transfer.proposedOwner === access.user.did);
  if (!access.isOwner && !isRecipient) {
    return (
      <SettingsSection>
        <SettingsGroup title="Transfer ownership">
          <SettingsRow
            label="Ownership"
            description="Only the group's owner or a proposed new owner can manage transfers."
          >
            <Text size="body-sm" tone="muted">
              There is no pending ownership transfer for you on this group.
            </Text>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection>
      <GroupOwnershipSection
        groupDid={access.groupDid}
        groupName={name}
        groupHandle={handle}
        callerDid={access.user.did}
        isOwner={access.isOwner}
        members={members}
        initialTransfer={transfer}
      />
    </SettingsSection>
  );
}

export default function GroupOwnershipSettingsPage({
  params,
}: PageProps<"/[actor]/settings/ownership">) {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={2} />}>
      <GroupOwnership params={params} />
    </Suspense>
  );
}
