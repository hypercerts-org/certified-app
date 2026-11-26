import { CopyableId, Text } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { EmailRow, HandleRow, PasswordResetRow } from "@/components/settings/account-controls";
import {
  readPersonalAccountDetails,
  requirePersonalSettings,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/settings-frame";
import { SignOutForm } from "@/components/sign-out-form";

async function AccountSettings() {
  const access = await requirePersonalSettings("/settings");
  if (!access) return null;

  const { user, session, pdsDomain } = access;
  const { handle, email, emailConfirmed } = await readPersonalAccountDetails(session, user.did);

  return (
    <SettingsSection>
      <SettingsGroup
        title="Account"
        description="Your permanent ID, handle, sign-in email, password, and active session."
      >
        <SettingsRow
          label="Permanent ID"
          description="Your account's DID. Unlike your handle, it never changes."
        >
          <CopyableId value={user.did} label="Permanent ID" />
        </SettingsRow>

        <HandleRow did={user.did} initialHandle={handle} pdsDomain={pdsDomain} />

        <EmailRow initialEmail={email} initialConfirmed={emailConfirmed} />

        <PasswordResetRow email={email} />

        <SettingsRow
          label="Session"
          description="Sign this browser out of Certified. Other browsers stay signed in."
          actions={<SignOutForm buttonClassName="settings-action">Sign out</SignOutForm>}
        >
          <Text size="body-sm" tone="muted">
            Signed in on this browser.
          </Text>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  );
}

export default function PersonalAccountSettingsPage() {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={5} />}>
      <AccountSettings />
    </Suspense>
  );
}
