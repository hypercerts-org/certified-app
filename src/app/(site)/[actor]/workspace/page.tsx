import type { l } from "@atproto/lex";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { isOwnWorkspace, workspaceDid } from "@/components/workspace-access";
import {
  GroupMembersSection,
  type GroupMemberView,
  OrganizationsSection,
  OrganizationsSkeleton,
  OverviewSkeleton,
  WorkspaceOverview,
} from "@/components/workspace-overview";
import { CERTIFIED_PDS_URL } from "@/lib/auth/config";
import { getUser, SessionUnavailableError } from "@/lib/auth/dal";
import { getActorCards } from "@/lib/hypercerts/queries";
import { logError } from "@/lib/log";
import { getGroupMembers, getMemberships } from "@/lib/memberships";
import { toOrganizations } from "@/lib/organizations";

export const metadata: Metadata = { title: "Workspace", robots: { index: false } };

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };
const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/**
 * Your organizations, from your memberships, remembered per session
 * (memberships.ts). Memberships that can't be read are said to be so, not
 * shown as "none".
 */
async function YourOrganizations() {
  const pdsDomain = new URL(CERTIFIED_PDS_URL).hostname;
  let memberships: Awaited<ReturnType<typeof getMemberships>>;
  try {
    memberships = await getMemberships();
  } catch (err) {
    unstable_rethrow(err); // Next's own signals (prerendering, redirects) pass through
    if (!(err instanceof SessionUnavailableError)) logError("[workspace] memberships failed", err);
    return <OrganizationsSection organizations="unavailable" pdsDomain={pdsDomain} />;
  }
  if (memberships === "expired") {
    return <OrganizationsSection organizations="expired" pdsDomain={pdsDomain} />;
  }
  return (
    <OrganizationsSection
      organizations={await toOrganizations(memberships ?? [])}
      pdsDomain={pdsDomain}
    />
  );
}

/** An organization's members from CGS (cached per session/Valkey), with admin/owner controls. */
async function GroupMembers({ did }: { did: string }) {
  try {
    const user = await getUser();
    if (!user) return null;
    const raw = await getGroupMembers(did as l.DidString);
    if (!raw) return null;
    if (raw === "expired") {
      return <GroupMembersSection groupDid={did} members="expired" viewerRole={null} />;
    }
    const cards = new Map(
      (await getActorCards(raw.map((member) => member.did))).map((card) => [card.did, card]),
    );
    const viewerRole = raw.find((member) => member.did === user.did)?.role ?? null;
    const members: GroupMemberView[] = raw
      .map((member) => ({
        actor: cards.get(member.did) ?? {
          did: member.did,
          handle: null,
          displayName: member.did,
          description: null,
          avatarUrl: null,
          isOrganization: false,
        },
        role: member.role,
        roleLabel: ROLE_LABEL[member.role] ?? member.role,
      }))
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
    return (
      <GroupMembersSection
        groupDid={did}
        callerDid={user.did}
        members={members}
        viewerRole={viewerRole}
      />
    );
  } catch (err) {
    unstable_rethrow(err);
    if (!(err instanceof SessionUnavailableError)) {
      logError("[workspace] group members failed", err, { did });
    }
    return <GroupMembersSection groupDid={did} members="unavailable" viewerRole={null} />;
  }
}

async function Overview({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const own = await isOwnWorkspace(did);
  return (
    <WorkspaceOverview
      did={did}
      organizations={
        <Suspense fallback={<OrganizationsSkeleton />}>
          {own ? <YourOrganizations /> : <GroupMembers did={did} />}
        </Suspense>
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
