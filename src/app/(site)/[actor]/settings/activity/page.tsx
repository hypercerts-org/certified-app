import { Banner, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { GroupAuditLogSection } from "@/components/settings/group-sections";
import { requireGroupSettings, SettingsCardsSkeleton } from "@/components/settings/settings-access";
import { SettingsCard, SettingsSection } from "@/components/settings/settings-frame";
import { queryGroupAuditLog } from "@/lib/cgs";
import type { AuditEntryView } from "@/lib/hypercerts/group-actions";
import { getActorCards } from "@/lib/hypercerts/queries";
import { logError } from "@/lib/log";

export const metadata: Metadata = { title: "Activity log" };

async function GroupActivityLog({ params }: { params: Promise<{ actor: string }> }) {
  const access = await requireGroupSettings(params, "/activity");
  if (!access) return null;

  if (!access.isAdmin) {
    return (
      <SettingsSection description="Recent actions taken in this group.">
        <SettingsCard title="Audit log">
          <Text size="body-sm" tone="muted">
            Only admins and owners can view the activity log.
          </Text>
        </SettingsCard>
      </SettingsSection>
    );
  }

  let entries: AuditEntryView[] = [];
  let cursor: string | undefined;
  let loadError = false;

  try {
    const result = await queryGroupAuditLog(access.session, access.groupDid, { limit: 50 });
    cursor = result.cursor;
    const uniqueActors = [...new Set(result.entries.map((entry) => entry.actorDid))];
    const cards = new Map((await getActorCards(uniqueActors)).map((c) => [c.did, c]));
    entries = result.entries.map((entry) => {
      const card = cards.get(entry.actorDid);
      return {
        ...entry,
        actorHandle: card?.handle ?? null,
        actorDisplayName: card?.displayName ?? entry.actorDid,
      };
    });
  } catch (err) {
    unstable_rethrow(err);
    logError("[group-settings] audit log failed", err, { groupDid: access.groupDid });
    loadError = true;
  }

  return (
    <SettingsSection description="Recent actions taken in this group.">
      {loadError ? (
        <SettingsCard title="Audit log">
          <Banner tone="danger">
            Couldn&apos;t load the activity log right now. Reload the page to try again.
          </Banner>
        </SettingsCard>
      ) : (
        <GroupAuditLogSection
          groupDid={access.groupDid}
          initialEntries={entries}
          initialCursor={cursor}
        />
      )}
    </SettingsSection>
  );
}

export default function GroupActivitySettingsPage({
  params,
}: PageProps<"/[actor]/settings/activity">) {
  return (
    <Suspense fallback={<SettingsCardsSkeleton count={1} />}>
      <GroupActivityLog params={params} />
    </Suspense>
  );
}
