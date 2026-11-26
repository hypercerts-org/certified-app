import { Badge, IdentityRow, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { identityOf } from "@/components/actor";
import { actorHref, workspaceHref } from "@/components/cards";
import { ImportAsGroupSection } from "@/components/settings/import-as-group-section";
import {
  readPersonalAccountDetails,
  requirePersonalSettings,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import {
  SettingsAction,
  SettingsGroup,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-frame";
import { SessionUnavailableError } from "@/lib/auth/dal";
import { logError } from "@/lib/log";
import { getMemberships } from "@/lib/memberships";
import { toOrganizations } from "@/lib/organizations";
import { groupSettingsHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Groups" };

async function PersonalGroups() {
  const access = await requirePersonalSettings("/settings/groups");
  if (!access) return null;

  const [{ handle }, memberships] = await Promise.all([
    readPersonalAccountDetails(access.session, access.user.did),
    getMemberships().catch((err) => {
      unstable_rethrow(err);
      if (!(err instanceof SessionUnavailableError)) {
        logError("[settings] groups list failed", err);
      }
      return null;
    }),
  ]);

  const groups = Array.isArray(memberships) ? await toOrganizations(memberships) : null;

  return (
    <SettingsSection>
      <SettingsGroup
        title="Your groups"
        description="Shared accounts you belong to and can act for on Certified."
      >
        {groups === null ? (
          <SettingsRow
            label="Memberships"
            description="Groups you belong to through the Certified Group Service."
          >
            <Text size="body-sm" tone="muted">
              Your groups can&apos;t be loaded right now. Try reloading in a moment.
            </Text>
          </SettingsRow>
        ) : groups.length === 0 ? (
          <SettingsRow
            label="Memberships"
            description="Groups you belong to through the Certified Group Service."
          >
            <Text size="body-sm" tone="muted">
              You don&apos;t belong to any groups yet. Create one below or ask a group&apos;s admin
              to add you.
            </Text>
          </SettingsRow>
        ) : (
          <ul className="divided settings-list">
            {groups.map((group) => (
              <li key={group.did} className="settings-list-row">
                <IdentityRow
                  {...identityOf(group)}
                  href={actorHref(group)}
                  secondary={[group.roleLabel, group.handle && `@${group.handle}`]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <div className="settings-row-actions">
                  <Badge variant="neutral">{group.roleLabel}</Badge>
                  <SettingsAction href={groupSettingsHref(group.did)}>Settings</SettingsAction>
                  <SettingsAction tone="muted" href={workspaceHref(group.did)}>
                    Workspace
                  </SettingsAction>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsGroup>

      <ImportAsGroupSection did={access.user.did} handle={handle} pdsDomain={access.pdsDomain} />
    </SettingsSection>
  );
}

export default function PersonalGroupsSettingsPage() {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={3} />}>
      <PersonalGroups />
    </Suspense>
  );
}
