import { Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { ProfileSettings } from "@/components/settings/profile-settings";
import {
  loadGroupIdentity,
  requireGroupSettings,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/settings-frame";
import { getActor, listSavedPlaces } from "@/lib/hypercerts/queries";
import {
  editableRepository,
  getOrganizationDetails,
  getProfileDetails,
} from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";

export const metadata: Metadata = { title: "Profile" };

async function GroupProfileSettings({ params }: { params: Promise<{ actor: string }> }) {
  const access = await requireGroupSettings(params, "/profile");
  if (!access) return null;

  const { groupDid, session, isAdmin, isSelfOwned } = access;
  if (!isAdmin && !isSelfOwned) {
    return (
      <SettingsSection>
        <SettingsGroup title="Details">
          <SettingsRow
            label="Profile editing"
            description="Public name, photo, banner, bio, and organization details."
          >
            <Text size="body-sm" tone="muted">
              Only group admins and the owner can edit this group&apos;s profile.
            </Text>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    );
  }

  try {
    const repository = await editableRepository(session, groupDid);
    if (!repository) {
      return (
        <SettingsSection>
          <Text tone="muted">
            Only group admins and the owner can edit this group&apos;s profile.
          </Text>
        </SettingsSection>
      );
    }

    const [profile, organization, savedLocations, actor, identity] = await Promise.all([
      getProfileDetails(repository),
      getOrganizationDetails(repository),
      listSavedPlaces(groupDid).catch(() => []),
      getActor(groupDid).catch(() => null),
      loadGroupIdentity(groupDid),
    ]);

    return (
      <SettingsSection>
        <ProfileSettings
          repo={groupDid}
          handle={identity.handle ?? actor?.handle ?? null}
          isGroup
          initialProfile={profile}
          initialOrganization={organization}
          savedLocations={savedLocations}
          initialLocationName={actor?.place?.short ?? null}
        />
      </SettingsSection>
    );
  } catch (err) {
    unstable_rethrow(err);
    logError("[group-settings] profile load failed", err, { groupDid });
    return (
      <SettingsSection>
        <Text tone="muted">
          This group&apos;s profile can&apos;t be loaded right now. Please try again shortly.
        </Text>
      </SettingsSection>
    );
  }
}

export default function GroupProfileSettingsPage({
  params,
}: PageProps<"/[actor]/settings/profile">) {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={6} />}>
      <GroupProfileSettings params={params} />
    </Suspense>
  );
}
