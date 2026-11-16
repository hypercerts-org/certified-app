import { Button, CopyableId, Heading, SettingRow, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { actorHref, workspaceHref } from "@/components/cards";
import { SignOutForm } from "@/components/sign-out-form";
import { getUser } from "@/lib/auth/dal";
import { signInHref } from "@/lib/validate";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

// Settings for the person signed in, whichever workspace is open. An
// organization's profile is edited from its workspace.
async function Settings() {
  const user = await getUser();
  if (!user) redirect(signInHref("/settings"));
  return (
    <div className="settings">
      <SettingRow title="Profile" description="Your name and description, as others see them.">
        <Button href={`${actorHref(user.did)}/edit`} variant="secondary" size="sm">
          Edit profile
        </Button>
      </SettingRow>
      <SettingRow
        title="Organizations"
        description="The organizations you belong to are listed in your workspace."
      >
        <Button href={workspaceHref(user.did)} variant="secondary" size="sm">
          Open workspace
        </Button>
      </SettingRow>
      <SettingRow
        title="Permanent ID"
        description="Your account's DID. Unlike a handle it never changes, so apps and records refer to you by it."
      >
        <CopyableId value={user.did} label="Permanent ID" />
      </SettingRow>
      <SettingRow title="Session" description="Sign this browser out of Certified.">
        <SignOutForm>Sign out</SignOutForm>
      </SettingRow>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="page">
      <div className="stack">
        <Heading level={1} size="display-3">
          Settings
        </Heading>
        <Text tone="muted">Your account on Certified.</Text>
      </div>
      <Suspense fallback={<Skeleton variant="text" lines={4} />}>
        <Settings />
      </Suspense>
    </div>
  );
}
