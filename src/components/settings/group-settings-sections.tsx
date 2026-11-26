// Group settings → Account, below the account's own rows: the group's
// members and their roles, a transfer of its ownership (for the owner, or the
// member it is offered to), and its group status (the owner only). They were
// tabs of their own; on one page, a group's settings are read top to bottom.

import { Badge } from "@hypercerts-org/ui-react";
import { ActorRow } from "@/components/actor";
import { actorHref } from "@/components/cards";
import { AddMemberDialog, MemberActions } from "@/components/group-dialogs";
import { GroupOwnershipSection, GroupStatusSection } from "@/components/settings/group-sections";
import {
  type GroupAccess,
  loadGroupIdentity,
  loadGroupMembers,
  loadOwnershipTransfer,
} from "@/components/settings/settings-access";
import { SettingsGroup } from "@/components/settings/settings-frame";
import { nameOf } from "@/lib/hypercerts/views";

type Access = Extract<GroupAccess, { status: "ok" }>;

/** Who belongs to the group, with their roles; admins add and remove, the owner changes roles. */
export async function GroupMembersGroup({ access }: { access: Access }) {
  const members = await loadGroupMembers(access.groupDid);
  return (
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
                secondary={actor.handle ? `@${actor.handle}` : undefined}
              />
              <div className="settings-inline-actions">
                {/* The role once, here at the end. */}
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
  );
}

/** Handing the group to another member: for its owner, or the member it is offered to. */
export async function GroupOwnershipGroup({ access }: { access: Access }) {
  const [{ name, handle }, members, transfer] = await Promise.all([
    loadGroupIdentity(access.groupDid),
    loadGroupMembers(access.groupDid),
    loadOwnershipTransfer(access.session, access.groupDid),
  ]);
  const isRecipient = Boolean(transfer?.pending && transfer.proposedOwner === access.user.did);
  if (!access.isOwner && !isRecipient) return null;
  return (
    <GroupOwnershipSection
      groupDid={access.groupDid}
      groupName={name}
      groupHandle={handle}
      callerDid={access.user.did}
      isOwner={access.isOwner}
      members={members}
      initialTransfer={transfer}
    />
  );
}

/** Whether the account stays a group: its owner's choice. */
export async function GroupStatusGroup({ access }: { access: Access }) {
  if (!access.isOwner) return null;
  const { name, handle } = await loadGroupIdentity(access.groupDid);
  return (
    <GroupStatusSection
      groupDid={access.groupDid}
      groupName={name}
      groupHandle={handle}
      isSelfOwned={access.isSelfOwned}
    />
  );
}
