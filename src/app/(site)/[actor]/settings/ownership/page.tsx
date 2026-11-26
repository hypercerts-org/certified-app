import { Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { GroupOwnershipSection } from "@/components/settings/group-sections";
import {
  loadGroupIdentity,
  loadGroupMembers,
  loadOwnershipTransfer,
  requireGroupSettings,
  SettingsCardsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsCard, SettingsSection } from "@/components/settings/settings-frame";

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
      <SettingsSection description="Only the group's owner or a proposed new owner can manage ownership transfers.">
        <SettingsCard title="Transfer ownership">
          <Text size="body-sm" tone="muted">
            There is no pending ownership transfer for you on this group.
          </Text>
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection description="Hand this group to another member. They become the owner once they accept, and you become an admin. An unaccepted transfer expires after 7 days.">
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
    <Suspense fallback={<SettingsCardsSkeleton count={1} />}>
      <GroupOwnership params={params} />
    </Suspense>
  );
}
