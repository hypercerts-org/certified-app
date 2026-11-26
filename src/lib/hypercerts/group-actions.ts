"use server";

// Workspace group actions: registering a new group on the Certified Group
// Service (and initializing its organization & profile records with
// @hypercerts-org/sdk/organization), plus adding/removing members and updating
// member roles.

import { type l, XrpcError, XrpcResponseError } from "@atproto/lex";
import { createOrganization } from "@hypercerts-org/sdk/organization";
import { updateTag } from "next/cache";
import { CERTIFIED_PDS_URL } from "@/lib/auth/config";
import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { readActingAs, setActingAs } from "@/lib/auth/session";
import {
  acceptOwnershipTransfer,
  addGroupMember,
  CgsAuthError,
  cancelOwnershipTransfer,
  destroyGroup,
  forgetGroupMembers,
  forgetMemberships,
  type GroupAuditEntry,
  listGroupMembers,
  type OwnershipTransferStatus,
  proposeOwnershipTransfer,
  queryGroupAuditLog,
  registerGroup,
  removeGroupMember,
  setGroupMemberRole,
} from "@/lib/cgs";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { getActorCards, getIndexedProfile } from "@/lib/hypercerts/queries";
import { resolveAccountDid } from "@/lib/hypercerts/resolve-target";
import { sdkContext } from "@/lib/hypercerts/sdk";
import { logError } from "@/lib/log";
import { workspaceHref } from "@/lib/routes";
import { isDid, isEmail, isHandleLabel } from "@/lib/validate";

export type GroupActionFailure = { ok: false; message: string };

export type CreateGroupResult =
  | {
      ok: true;
      groupDid: string;
      handle: string;
      accountPassword: string | null;
      href: string;
      profileNote?: string;
    }
  | GroupActionFailure;

export type MemberActionResult = { ok: true } | GroupActionFailure;

function defaultGroupDomain(): string {
  return new URL(CERTIFIED_PDS_URL).hostname;
}

/**
 * Normalizes a group handle into the bare subdomain label CGS's
 * `app.certified.group.register` expects (`^[a-zA-Z0-9-]+$`). Accepts either
 * `"my-group"` or `"my-group.certified.one"`.
 */
function normalizeHandle(raw: string): string | null {
  const cleaned = raw.trim().replace(/^@/, "").toLowerCase();
  if (!cleaned) return null;
  const suffix = `.${defaultGroupDomain().toLowerCase()}`;
  const label = cleaned.endsWith(suffix) ? cleaned.slice(0, -suffix.length) : cleaned;
  if (!isHandleLabel(label)) return null;
  return label;
}

function cgsErrorMessage(err: unknown, fallback: string, specific?: Record<string, string>) {
  if (err instanceof XrpcResponseError) {
    if (err.error && specific?.[err.error]) return specific[err.error];
    if (err.status === 401 || err.status === 403) {
      return "You don't have permission to do that for this group.";
    }
    if (err.status >= 500) {
      return "We couldn't confirm whether the change succeeded. Reload to check.";
    }
    if (err.status >= 400 && err.status < 500 && err.message?.trim()) {
      return err.message.trim();
    }
  } else if (err instanceof XrpcError) {
    return "We couldn't confirm whether the change succeeded. Reload to check.";
  }
  if (!(err instanceof SessionUnavailableError) && !(err instanceof CgsAuthError)) {
    logError(`[groups] ${fallback}`, err);
  }
  return fallback;
}

/**
 * Registers a new group on CGS with the signed-in user as owner, and creates
 * its initial organization & profile records via `@hypercerts-org/sdk/organization`.
 */
export async function createGroup(input: {
  handle: string;
  displayName?: string;
  description?: string;
  email?: string;
}): Promise<CreateGroupResult> {
  const handle = typeof input?.handle === "string" ? normalizeHandle(input.handle) : null;
  if (!handle) {
    return {
      ok: false,
      message: `Enter a valid handle (letters, numbers, and hyphens, e.g. my-org or my-org.${defaultGroupDomain()}).`,
    };
  }
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  if (email && !isEmail(email)) {
    return { ok: false, message: "Enter a valid email address, or leave it blank." };
  }
  const displayName = typeof input?.displayName === "string" ? input.displayName.trim() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  if (displayName.length > 640 || description.length > 2560) {
    return { ok: false, message: "Display name or description is too long." };
  }

  try {
    const session = await getOAuthSession();
    if (!session)
      return { ok: false, message: "Your session has ended. Sign in again to continue." };

    const registered = await registerGroup(session, {
      handle,
      email: email || undefined,
    });
    await forgetMemberships(session.did).catch((err) =>
      logError("[groups] failed to clear membership cache", err),
    );

    // Initialize the group's organization + profile records through the SDK.
    // The group is already registered, so a failure here is surfaced as a note
    // without hiding the one-time accountPassword.
    let profileNote: string | undefined;
    try {
      const initialized = await createOrganization(
        await sdkContext(session),
        {
          organization: {},
          profileIfMissing: {
            ...(displayName && { displayName }),
            ...(description && { description }),
          },
        },
        { repo: registered.groupDid },
      );
      if (initialized.profile?.cid) {
        const expectedCid = initialized.profile.cid;
        await waitForIndex(
          async () => (await getIndexedProfile(registered.groupDid))?.cid === expectedCid,
        );
      }
    } catch (err) {
      logError("[groups] initial organization record failed", err, {
        groupDid: registered.groupDid,
      });
      profileNote =
        "The group was created, but its initial profile couldn't be saved yet. You can edit it from the workspace.";
    }

    updateTag(tags.actor(registered.groupDid));
    updateTag(tags.explore());
    updateTag(tags.memberships(session.did));
    return {
      ok: true,
      groupDid: registered.groupDid,
      handle: registered.handle,
      accountPassword: registered.accountPassword ?? null,
      href: workspaceHref(registered.groupDid),
      profileNote,
    };
  } catch (err) {
    return {
      ok: false,
      message: cgsErrorMessage(err, "Couldn't create the group right now. Please try again.", {
        HandleNotAvailable: "That handle is already taken. Try another.",
        GroupAlreadyRegistered: "That group is already registered.",
      }),
    };
  }
}

/** Adds an account (by handle, DID, or Certified profile link) to a group on CGS. */
export async function addMember(
  groupDid: string,
  input: { target: string; role: "member" | "admin" },
): Promise<MemberActionResult> {
  if (
    typeof groupDid !== "string" ||
    !isDid(groupDid) ||
    typeof input?.target !== "string" ||
    (input.role !== "member" && input.role !== "admin")
  ) {
    return { ok: false, message: "Check the member handle and role." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    const memberDid = await resolveAccountDid(input.target);
    if (!memberDid || !isDid(memberDid)) {
      return {
        ok: false,
        message: "Couldn't find that account. Enter a handle, DID, or Certified profile link.",
      };
    }
    if (memberDid === groupDid) {
      return { ok: false, message: "A group can't be added as its own member." };
    }

    await addGroupMember(session, groupDid, memberDid, input.role);
    await Promise.all([
      forgetMemberships(memberDid).catch((err) =>
        logError("[groups] failed to clear membership cache", err, { memberDid }),
      ),
      forgetGroupMembers(groupDid).catch((err) =>
        logError("[groups] failed to clear group members cache", err, { groupDid }),
      ),
    ]);
    updateTag(tags.memberships(memberDid));
    updateTag(tags.groupMembers(groupDid));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: cgsErrorMessage(err, "Couldn't add that member right now. Please try again.", {
        MemberAlreadyExists: "That account is already a member of this group.",
        Forbidden: "Only admins and owners can add members.",
      }),
    };
  }
}

/** Removes `memberDid` from group `groupDid` on CGS (admin or owner). */
export async function removeMember(
  groupDid: string,
  memberDid: string,
): Promise<MemberActionResult> {
  if (
    typeof groupDid !== "string" ||
    !isDid(groupDid) ||
    typeof memberDid !== "string" ||
    !isDid(memberDid)
  ) {
    return { ok: false, message: "Invalid member or group." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    await removeGroupMember(session, groupDid as l.DidString, memberDid as l.DidString);
    await Promise.all([
      forgetMemberships(memberDid).catch((err) =>
        logError("[groups] failed to clear membership cache", err, { memberDid }),
      ),
      forgetGroupMembers(groupDid).catch((err) =>
        logError("[groups] failed to clear group members cache", err, { groupDid }),
      ),
    ]);
    updateTag(tags.memberships(memberDid));
    updateTag(tags.groupMembers(groupDid));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: cgsErrorMessage(err, "Couldn't remove that member right now. Please try again.", {
        CannotRemoveOwner: "The group's owner can't be removed.",
        MemberNotFound: "That account is no longer a member.",
        Forbidden: "Only admins and owners can remove members.",
      }),
    };
  }
}

/** Changes `memberDid`'s role between member and admin on CGS (owner only). */
export async function changeMemberRole(
  groupDid: string,
  input: { memberDid: string; role: "member" | "admin" },
): Promise<MemberActionResult> {
  if (
    typeof groupDid !== "string" ||
    !isDid(groupDid) ||
    typeof input?.memberDid !== "string" ||
    !isDid(input.memberDid) ||
    (input.role !== "member" && input.role !== "admin")
  ) {
    return { ok: false, message: "Invalid member or role." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    await setGroupMemberRole(
      session,
      groupDid as l.DidString,
      input.memberDid as l.DidString,
      input.role,
    );
    await Promise.all([
      forgetMemberships(input.memberDid).catch((err) =>
        logError("[groups] failed to clear membership cache", err, { memberDid: input.memberDid }),
      ),
      forgetGroupMembers(groupDid).catch((err) =>
        logError("[groups] failed to clear group members cache", err, { groupDid }),
      ),
    ]);
    updateTag(tags.memberships(input.memberDid));
    updateTag(tags.groupMembers(groupDid));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: cgsErrorMessage(err, "Couldn't update that role right now. Please try again.", {
        CannotModifyOwner: "The owner's role can't be changed here.",
        Forbidden: "Only the group's owner can change member roles.",
      }),
    };
  }
}

export type AuditEntryView = GroupAuditEntry & {
  actorHandle: string | null;
  actorDisplayName: string;
};

export type AuditLogResult =
  | { ok: true; entries: AuditEntryView[]; cursor?: string }
  | GroupActionFailure;

/** Queries a page of a group's CGS audit log (admin or owner), resolving actor handles. */
export async function getGroupAuditLog(groupDid: string, cursor?: string): Promise<AuditLogResult> {
  if (typeof groupDid !== "string" || !isDid(groupDid)) {
    return { ok: false, message: "Invalid group." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
    const { entries, cursor: nextCursor } = await queryGroupAuditLog(
      session,
      groupDid as l.DidString,
      { limit: 50, cursor },
    );
    const uniqueActors = [...new Set(entries.map((entry) => entry.actorDid))];
    const cards = new Map((await getActorCards(uniqueActors)).map((card) => [card.did, card]));
    return {
      ok: true,
      cursor: nextCursor,
      entries: entries.map((entry) => {
        const card = cards.get(entry.actorDid);
        return {
          ...entry,
          actorHandle: card?.handle ?? null,
          actorDisplayName: card?.displayName ?? entry.actorDid,
        };
      }),
    };
  } catch (err) {
    return {
      ok: false,
      message: cgsErrorMessage(err, "Couldn't load the activity log right now.", {
        Forbidden: "Only admins and owners can view the activity log.",
      }),
    };
  }
}

export type OwnershipTransferResult =
  | { ok: true; transfer: OwnershipTransferStatus }
  | GroupActionFailure;

/** Proposes transferring group ownership to an existing non-owner member (owner only). */
export async function proposeGroupOwnershipTransfer(
  groupDid: string,
  newOwnerDid: string,
): Promise<OwnershipTransferResult> {
  if (
    typeof groupDid !== "string" ||
    !isDid(groupDid) ||
    typeof newOwnerDid !== "string" ||
    !isDid(newOwnerDid)
  ) {
    return { ok: false, message: "Choose a valid member." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
    const result = await proposeOwnershipTransfer(
      session,
      groupDid as l.DidString,
      newOwnerDid as l.DidString,
    );
    return {
      ok: true,
      transfer: {
        groupDid: result.groupDid,
        pending: true,
        proposedOwner: result.proposedOwner,
        proposedBy: result.proposedBy,
        createdAt: result.createdAt,
        expiresAt: result.expiresAt,
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: cgsErrorMessage(err, "Couldn't propose the ownership transfer right now.", {
        NotAMember: "The proposed owner must already be a member of this group.",
        AlreadyOwner: "That account is already the owner of this group.",
        Forbidden: "Only the current owner can propose a transfer.",
      }),
    };
  }
}

/** Accepts a pending ownership transfer, promoting the caller to owner and previous owner to admin. */
export async function acceptGroupOwnershipTransfer(groupDid: string): Promise<MemberActionResult> {
  if (typeof groupDid !== "string" || !isDid(groupDid)) {
    return { ok: false, message: "Invalid group." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
    const result = await acceptOwnershipTransfer(session, groupDid as l.DidString);
    const affectedDids = [session.did, ...(result.previousOwner ? [result.previousOwner] : [])];
    await Promise.all([
      ...affectedDids.map((did) =>
        forgetMemberships(did).catch((err) =>
          logError("[groups] failed to clear membership cache", err, { did }),
        ),
      ),
      forgetGroupMembers(groupDid).catch((err) =>
        logError("[groups] failed to clear group members cache", err, { groupDid }),
      ),
    ]);
    for (const did of affectedDids) updateTag(tags.memberships(did));
    updateTag(tags.groupMembers(groupDid));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: cgsErrorMessage(err, "Couldn't accept the ownership transfer right now.", {
        NoPendingTransfer: "There is no pending ownership transfer for you to accept.",
      }),
    };
  }
}

/** Cancels (owner) or declines (proposed recipient) a pending ownership transfer. */
export async function cancelGroupOwnershipTransfer(groupDid: string): Promise<MemberActionResult> {
  if (typeof groupDid !== "string" || !isDid(groupDid)) {
    return { ok: false, message: "Invalid group." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
    await cancelOwnershipTransfer(session, groupDid as l.DidString);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: cgsErrorMessage(err, "Couldn't cancel the ownership transfer right now.", {
        NoPendingTransfer: "There is no pending ownership transfer to cancel.",
      }),
    };
  }
}

/**
 * Turns a CGS group back into a regular account (`app.certified.group.destroy`,
 * owner only). Clears the acting-as cookie if active and invalidates membership
 * caches for every former member.
 */
export async function destroyGroupAccount(groupDid: string): Promise<MemberActionResult> {
  if (typeof groupDid !== "string" || !isDid(groupDid)) {
    return { ok: false, message: "Invalid group." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    // Read current members best-effort before destroy so we can clear their caches too.
    const formerMembers = await listGroupMembers(session, groupDid as l.DidString).catch(() => [
      { did: session.did },
    ]);

    await destroyGroup(session, groupDid as l.DidString);

    if ((await readActingAs()) === groupDid) {
      await setActingAs(null);
    }

    const memberDids = [...new Set([session.did, ...formerMembers.map((m) => m.did)])];
    await Promise.all([
      ...memberDids.map((did) =>
        forgetMemberships(did).catch((err) =>
          logError("[groups] failed to clear membership cache", err, { did }),
        ),
      ),
      forgetGroupMembers(groupDid).catch((err) =>
        logError("[groups] failed to clear group members cache", err, { groupDid }),
      ),
    ]);
    for (const did of memberDids) updateTag(tags.memberships(did));
    updateTag(tags.groupMembers(groupDid));
    updateTag(tags.actor(groupDid));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: cgsErrorMessage(
        err,
        "Couldn't turn this group back into a regular account right now.",
        {
          GroupNotFound: "This account is no longer registered as a group.",
          Forbidden: "Only the group's owner can change its group status.",
        },
      ),
    };
  }
}
