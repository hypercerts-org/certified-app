import type { Metadata } from "next";
import { Suspense } from "react";
import { isOwnWorkspace, workspaceDid } from "@/components/workspace-access";
import {
  OrganizationsSection,
  OrganizationsSkeleton,
  OverviewSkeleton,
  WorkspaceOverview,
} from "@/components/workspace-overview";
import { getMemberships } from "@/lib/memberships";
import { toOrganizations } from "@/lib/organizations";

export const metadata: Metadata = { title: "Workspace", robots: { index: false } };

// A workspace is what one account holds and what you manage for it: your own,
// or that of an organization you belong to. The URL names which; `/workspace`
// opens the one you act as.
//
// Most of the overview is public data about the account, cached and shared
// (its records, endorsements, followers, profile), so a link prefetches it and
// the page shows at once. Your organizations and "Edit profile" come from
// your memberships, remembered per session (memberships.ts). Who may open the
// workspace is checked by its layout (workspace-access.tsx).

/** Your organizations, from your memberships, remembered per session (memberships.ts). */
async function YourOrganizations() {
  const memberships = await getMemberships().catch(() => null);
  return (
    <OrganizationsSection
      organizations={Array.isArray(memberships) ? await toOrganizations(memberships) : []}
    />
  );
}

async function Overview({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  const own = await isOwnWorkspace(did);
  return (
    <WorkspaceOverview
      did={did}
      organizations={
        own ? (
          <Suspense fallback={<OrganizationsSkeleton />}>
            <YourOrganizations />
          </Suspense>
        ) : null
      }
    />
  );
}

export default function WorkspacePage({ params }: PageProps<"/[actor]/workspace">) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}
