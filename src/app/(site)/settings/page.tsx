import { Button, CopyableId } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { actorHref, workspaceHref } from "@/components/cards";
import { EmailCard, HandleCard, PasswordResetCard } from "@/components/settings/account-controls";
import {
  readPersonalAccountDetails,
  requirePersonalSettings,
  SettingsCardsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsCard, SettingsSection } from "@/components/settings/settings-frame";
import { SignOutForm } from "@/components/sign-out-form";

async function AccountSettings() {
  const access = await requirePersonalSettings("/settings");
  if (!access) return null;

  const { user, session, pdsDomain } = access;
  const { handle, email, emailConfirmed } = await readPersonalAccountDetails(session, user.did);

  return (
    <SettingsSection description="Your profile, handle, sign-in email, password and permanent ID.">
      <SettingsCard
        title="Profile"
        description="Your name, picture, bio and links, as others see them."
        hint="Publicly visible on your Certified profile."
        actions={
          <Button href={`${actorHref(user.did)}/edit`} variant="secondary" size="sm">
            Edit profile
          </Button>
        }
      />

      <HandleCard did={user.did} initialHandle={handle} pdsDomain={pdsDomain} />

      <EmailCard initialEmail={email} initialConfirmed={emailConfirmed} />

      <PasswordResetCard email={email} />

      <SettingsCard
        title="Groups"
        description="The groups you belong to are listed in your workspace, or you can create or convert one under Groups."
        actions={
          <>
            <Button href="/settings/groups" variant="secondary" size="sm">
              Manage groups
            </Button>
            <Button href={workspaceHref(user.did)} variant="secondary" size="sm">
              Open workspace
            </Button>
          </>
        }
      />

      <SettingsCard
        title="Permanent ID"
        description="Your account's DID. Unlike your handle it never changes, so apps and records refer to you by it."
      >
        <div className="settings-value-box">
          <CopyableId value={user.did} label="Permanent ID" />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Session"
        description="Sign this browser out of Certified."
        hint="Other browsers signed in to this account stay active."
        actions={<SignOutForm>Sign out</SignOutForm>}
      />
    </SettingsSection>
  );
}

export default function PersonalAccountSettingsPage() {
  return (
    <Suspense fallback={<SettingsCardsSkeleton count={4} />}>
      <AccountSettings />
    </Suspense>
  );
}
