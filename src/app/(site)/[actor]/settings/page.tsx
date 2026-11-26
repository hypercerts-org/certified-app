import { Text } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { HandleId, PermanentId } from "@/components/account-ids";
import { EmailRow, HandleRow, PasswordResetRow } from "@/components/settings/account-controls";
import {
  GroupAccountManager,
  GroupPasswordResetRow,
} from "@/components/settings/group-account-controls";
import {
  GroupMembersGroup,
  GroupOwnershipGroup,
  GroupStatusGroup,
} from "@/components/settings/group-settings-sections";
import {
  loadGroupIdentity,
  readPersonalAccountDetails,
  requireGroupSettings,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/settings-frame";
import { SignOutForm } from "@/components/sign-out-form";

async function GroupAccountSettings({ params }: { params: Promise<{ actor: string }> }) {
  const access = await requireGroupSettings(params);
  if (!access) return null;

  const { groupDid, session, isAdmin, isSelfOwned, pdsDomain } = access;
  const [{ handle: groupHandle }, ownDetails] = await Promise.all([
    loadGroupIdentity(groupDid),
    isSelfOwned ? readPersonalAccountDetails(session, groupDid) : Promise.resolve(null),
  ]);

  const handle = ownDetails?.handle ?? groupHandle;
  const description =
    isSelfOwned || isAdmin
      ? "This group's permanent ID, handle, sign-in email, and password."
      : "This group's permanent ID and handle.";

  return (
    <SettingsSection>
      <SettingsGroup title="Account" description={description}>
        <SettingsRow
          label="Permanent ID"
          description="This group's DID. Unlike its handle, it never changes."
        >
          <PermanentId value={groupDid} />
        </SettingsRow>

        {isSelfOwned ? (
          <>
            <HandleRow
              did={groupDid}
              initialHandle={handle}
              pdsDomain={pdsDomain}
              description="The @handle people use to find this group on Certified."
            />
            <EmailRow
              initialEmail={ownDetails?.email ?? null}
              initialConfirmed={ownDetails?.emailConfirmed ?? true}
              description="Used to sign in and to recover this account."
            />
            <PasswordResetRow
              email={ownDetails?.email ?? null}
              description="Lets you sign in to other AT Protocol apps with this handle."
            />
          </>
        ) : isAdmin ? (
          <>
            <GroupAccountManager groupDid={groupDid} currentHandle={handle} pdsDomain={pdsDomain} />
            <GroupPasswordResetRow groupDid={groupDid} />
          </>
        ) : (
          <SettingsRow
            label="Handle"
            description="The @handle people use to find this group on Certified. Only admins and the owner can change it."
          >
            {handle ? (
              <HandleId handle={handle} />
            ) : (
              <Text size="body-sm" tone="muted">
                No handle verified
              </Text>
            )}
          </SettingsRow>
        )}

        {isSelfOwned && (
          <SettingsRow
            label="Session"
            description="Sign this browser out of Certified. Other browsers stay signed in."
            actions={<SignOutForm buttonClassName="settings-action">Sign out</SignOutForm>}
          >
            <Text size="body-sm" tone="muted">
              Signed in on this browser.
            </Text>
          </SettingsRow>
        )}
      </SettingsGroup>

      {/* Each streams in on its own, under the account's rows. */}
      <Suspense fallback={<SettingsRowsSkeleton rows={3} />}>
        <GroupMembersGroup access={access} />
      </Suspense>
      <Suspense fallback={null}>
        <GroupOwnershipGroup access={access} />
      </Suspense>
      <Suspense fallback={null}>
        <GroupStatusGroup access={access} />
      </Suspense>
    </SettingsSection>
  );
}

export default function GroupAccountSettingsPage({ params }: PageProps<"/[actor]/settings">) {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={4} />}>
      <GroupAccountSettings params={params} />
    </Suspense>
  );
}
