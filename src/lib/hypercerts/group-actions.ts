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
import {
  addGroupMember,
  CgsAuthError,
  forgetMemberships,
  registerGroup,
  removeGroupMember,
  setGroupMemberRole,
} from "@/lib/cgs";
import { tags } from "@/lib/hypercerts/cache";
import { resolveAccountDid } from "@/lib/hypercerts/resolve-target";
import { sdkContext } from "@/lib/hypercerts/sdk";
import { logError } from "@/lib/log";
import { workspaceHref } from "@/lib/routes";
import { isDid } from "@/lib/validate";

const HANDLE_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const FULL_HANDLE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/** Normalizes a bare label ("my-org") or full handle ("my-org.certified.one"). */
function normalizeHandle(raw: string): string | null {
  const cleaned = raw.trim().replace(/^@/, "").toLowerCase();
  if (!cleaned || cleaned.length > 253) return null;
  if (cleaned.includes(".")) return FULL_HANDLE.test(cleaned) ? cleaned : null;
  if (!HANDLE_LABEL.test(cleaned)) return null;
  const full = `${cleaned}.${defaultGroupDomain()}`;
  return full.length <= 253 ? full : null;
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
  if (email && (email.length > 254 || !EMAIL.test(email))) {
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
      await createOrganization(
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
    await forgetMemberships(memberDid).catch((err) =>
      logError("[groups] failed to clear membership cache", err, { memberDid }),
    );
    updateTag(tags.memberships(memberDid));
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
    await forgetMemberships(memberDid).catch((err) =>
      logError("[groups] failed to clear membership cache", err, { memberDid }),
    );
    updateTag(tags.memberships(memberDid));
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
    await forgetMemberships(input.memberDid).catch((err) =>
      logError("[groups] failed to clear membership cache", err, { memberDid: input.memberDid }),
    );
    updateTag(tags.memberships(input.memberDid));
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
