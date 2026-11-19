import { Button, CopyableId, SettingRow, Skeleton } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { actorHref, workspaceHref } from "@/components/cards";
import { PageHeader } from "@/components/page-title";
import { SignOutForm } from "@/components/sign-out-form";
import { getUser } from "@/lib/auth/dal";
import { signInHref } from "@/lib/validate";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

// Settings for the person signed in, whichever workspace is open. An
// organization's profile is edited from its workspace.

const ROWS = [
  { title: "Profile", description: "Your name and description, as others see them." },
  {
    title: "Organizations",
    description: "The organizations you belong to are listed in your workspace.",
  },
  {
    title: "Permanent ID",
    description:
      "Your account's DID. Unlike a handle it never changes, so apps and records refer to you by it.",
  },
  { title: "Session", description: "Sign this browser out of Certified." },
];

/** The rows, each with its control: the same while it loads, with skeletons for controls. */
function SettingRows({ controls }: { controls: ReactNode[] }) {
  return (
    <div className="settings">
      {ROWS.map((row, i) => (
        <SettingRow key={row.title} title={row.title} description={row.description}>
          {controls[i]}
        </SettingRow>
      ))}
    </div>
  );
}

async function Settings() {
  const user = await getUser();
  if (!user) redirect(signInHref("/settings"));
  return (
    <SettingRows
      controls={[
        <Button key="profile" href={`${actorHref(user.did)}/edit`} variant="secondary" size="sm">
          Edit profile
        </Button>,
        <Button key="workspace" href={workspaceHref(user.did)} variant="secondary" size="sm">
          Open workspace
        </Button>,
        <CopyableId key="id" value={user.did} label="Permanent ID" />,
        <SignOutForm key="session">Sign out</SignOutForm>,
      ]}
    />
  );
}

function SettingsSkeleton() {
  return (
    <SettingRows
      controls={ROWS.map((row) => (
        <Skeleton key={row.title} variant="box" className="skeleton-control" />
      ))}
    />
  );
}

export default function SettingsPage() {
  return (
    <div className="page">
      <PageHeader title="Settings" description="Your account on Certified." />
      <Suspense fallback={<SettingsSkeleton />}>
        <Settings />
      </Suspense>
    </div>
  );
}
