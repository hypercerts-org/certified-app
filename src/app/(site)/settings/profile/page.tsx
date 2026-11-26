import type { l } from "@atproto/lex";
import { Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { ProfileSettings } from "@/components/settings/profile-settings";
import {
  readPersonalAccountDetails,
  requirePersonalSettings,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsSection } from "@/components/settings/settings-frame";
import { getActor, listSavedPlaces } from "@/lib/hypercerts/queries";
import {
  editableRepository,
  getOrganizationDetails,
  getProfileDetails,
} from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";

export const metadata: Metadata = { title: "Profile" };

async function PersonalProfileSettings() {
  const access = await requirePersonalSettings("/settings/profile");
  if (!access) return null;

  const { user, session } = access;
  const did = user.did as l.DidString;

  try {
    const repository = await editableRepository(session, did);
    if (!repository) {
      return (
        <SettingsSection>
          <Text tone="muted">You don&apos;t have permission to edit this profile.</Text>
        </SettingsSection>
      );
    }

    const [profile, organization, savedLocations, actor, account] = await Promise.all([
      getProfileDetails(repository),
      getOrganizationDetails(repository),
      listSavedPlaces(did).catch(() => []),
      getActor(did).catch(() => null),
      readPersonalAccountDetails(session, did),
    ]);

    return (
      <SettingsSection>
        <ProfileSettings
          repo={did}
          handle={account.handle ?? actor?.handle ?? null}
          isGroup={false}
          initialProfile={profile}
          initialOrganization={organization}
          savedLocations={savedLocations}
          initialLocationName={actor?.place?.short ?? null}
        />
      </SettingsSection>
    );
  } catch (err) {
    unstable_rethrow(err);
    logError("[settings] profile load failed", err, { did });
    return (
      <SettingsSection>
        <Text tone="muted">
          This profile can&apos;t be loaded right now. Please try again shortly.
        </Text>
      </SettingsSection>
    );
  }
}

export default function PersonalProfileSettingsPage() {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={6} />}>
      <PersonalProfileSettings />
    </Suspense>
  );
}
