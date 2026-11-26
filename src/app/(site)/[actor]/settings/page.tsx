import { Button, CopyableId, Text } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { actorHref } from "@/components/cards";
import { EmailCard, HandleCard, PasswordResetCard } from "@/components/settings/account-controls";
import {
  GroupAccountManager,
  GroupPasswordResetCard,
} from "@/components/settings/group-account-controls";
import {
  loadGroupIdentity,
  readPersonalAccountDetails,
  requireGroupSettings,
  SettingsCardsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsCard, SettingsSection } from "@/components/settings/settings-frame";
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
      ? "This group's profile, handle and permanent ID, sign-in email and password."
      : "This group's handle and permanent ID.";

  return (
    <SettingsSection description={description}>
      {(isAdmin || isSelfOwned) && (
        <SettingsCard
          title="Profile"
          description="The group's name, picture, bio and links, as others see them."
          hint="Publicly visible on this group's Certified profile."
          actions={
            <Button href={`${actorHref(groupDid)}/edit`} variant="secondary" size="sm">
              Edit profile
            </Button>
          }
        />
      )}

      {isSelfOwned ? (
        <>
          <HandleCard
            did={groupDid}
            initialHandle={handle}
            pdsDomain={pdsDomain}
            description="The @handle people use to find this group on Certified."
          />
          <EmailCard
            initialEmail={ownDetails?.email ?? null}
            initialConfirmed={ownDetails?.emailConfirmed ?? true}
            description="Used to sign in and to recover this account."
          />
          <PasswordResetCard
            email={ownDetails?.email ?? null}
            description="Lets you sign in to other AT Protocol apps with this handle."
          />
        </>
      ) : isAdmin ? (
        <>
          <GroupAccountManager groupDid={groupDid} currentHandle={handle} pdsDomain={pdsDomain} />
          <GroupPasswordResetCard groupDid={groupDid} />
        </>
      ) : (
        <SettingsCard
          title="Handle"
          description="The @handle people use to find this group on Certified."
          hint="Only group admins and the owner can change the handle."
        >
          <div className="settings-value-box">
            {handle ? (
              <CopyableId value={handle} displayValue={`@${handle}`} label="Handle" />
            ) : (
              <Text size="body-sm" tone="muted">
                No handle verified
              </Text>
            )}
          </div>
        </SettingsCard>
      )}

      <SettingsCard
        title="Permanent ID"
        description="This group's DID. Unlike its handle it never changes, so apps and records refer to the group by it."
      >
        <div className="settings-value-box">
          <CopyableId value={groupDid} label="Permanent ID" />
        </div>
      </SettingsCard>

      {isSelfOwned && (
        <SettingsCard
          title="Session"
          description="Sign this browser out of Certified."
          hint="Other browsers signed in to this account stay active."
          actions={<SignOutForm>Sign out</SignOutForm>}
        />
      )}
    </SettingsSection>
  );
}

export default function GroupAccountSettingsPage({ params }: PageProps<"/[actor]/settings">) {
  return (
    <Suspense fallback={<SettingsCardsSkeleton count={3} />}>
      <GroupAccountSettings params={params} />
    </Suspense>
  );
}
