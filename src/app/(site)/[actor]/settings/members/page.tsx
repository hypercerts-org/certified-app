import { Badge } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActorRow } from "@/components/actor";
import { actorHref } from "@/components/cards";
import { AddMemberDialog, MemberActions } from "@/components/group-dialogs";
import {
  loadGroupMembers,
  requireGroupSettings,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsGroup, SettingsSection } from "@/components/settings/settings-frame";
import { nameOf } from "@/lib/hypercerts/views";

export const metadata: Metadata = { title: "Members and roles" };

async function GroupMembers({ params }: { params: Promise<{ actor: string }> }) {
  const access = await requireGroupSettings(params, "/members");
  if (!access) return null;

  const members = await loadGroupMembers(access.groupDid);

  return (
    <SettingsSection>
      <SettingsGroup
        title={`Members (${members.length})`}
        description={
          access.isOwner
            ? "Add members, change roles, and remove admins and members."
            : access.isAdmin
              ? "Add and remove members. Only the owner changes roles."
              : "The owner and admins manage who belongs to this group."
        }
        action={access.isAdmin ? <AddMemberDialog groupDid={access.groupDid} /> : undefined}
      >
        <ul className="divided settings-list">
          {members.map(({ actor, role, roleLabel }) => {
            const isSelf = actor.did === access.user.did;
            const canChangeRole = access.isOwner && role !== "owner";
            const canRemove =
              !isSelf &&
              role !== "owner" &&
              (access.isOwner || (access.isAdmin && role === "member"));
            return (
              <li key={actor.did} className="settings-list-row">
                <ActorRow
                  actor={actor}
                  href={actorHref(actor)}
                  secondary={[roleLabel, actor.handle && `@${actor.handle}`]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <div className="settings-inline-actions">
                  <Badge variant="neutral">{roleLabel}</Badge>
                  <MemberActions
                    groupDid={access.groupDid}
                    memberDid={actor.did}
                    memberName={nameOf(actor)}
                    role={role}
                    canChangeRole={canChangeRole}
                    canRemove={canRemove}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </SettingsGroup>
    </SettingsSection>
  );
}

export default function GroupMembersSettingsPage({
  params,
}: PageProps<"/[actor]/settings/members">) {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={3} />}>
      <GroupMembers params={params} />
    </Suspense>
  );
}
