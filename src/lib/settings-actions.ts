"use server";

// Server Actions for Personal & Group Settings:
// - Account handle (subdomain & custom domain) and password reset
// - Elevated password sessions (Valkey-backed, 10m TTL) for PDS operations that
//   reject OAuth tokens: personal email changes, app passwords, and non-self
//   group handle/email management
// - Promoting the signed-in account into a CGS group (`app.certified.group.import`)
// - Social graph sync between Certified (`app.certified.graph.follow`) and
//   Bluesky (`app.bsky.graph.follow`)

import { currentDatetimeString, type l, XrpcError, XrpcResponseError } from "@atproto/lex";
import { createOrganization } from "@hypercerts-org/sdk/organization";
import { followAccount } from "@hypercerts-org/sdk/social";
import { updateTag } from "next/cache";
import { assertWritesAllowed } from "@/lib/atproto/app-key";
import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import {
  callElevatedPds,
  callOAuthPds,
  callPublicPds,
  type ElevatedScope,
  type EstablishResult,
  endElevatedSession,
  establishElevatedSession,
  hasElevatedSession,
  readPdsError,
  verifyGroupPassword,
} from "@/lib/auth/elevated-session";
import { CgsAuthError, canEdit, forgetMemberships, importGroup, isMember } from "@/lib/cgs";
import { tags } from "@/lib/hypercerts/cache";
import { getActorCards } from "@/lib/hypercerts/queries";
import { sdkContext, writeTo } from "@/lib/hypercerts/sdk";
import type { ActorCard } from "@/lib/hypercerts/views";
import { repositoryFor } from "@/lib/hypercerts/writes";
import { logError } from "@/lib/log";
import { isDid } from "@/lib/validate";

const FULL_HANDLE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_APP_PW_NAME = 100;
const MAX_FOLLOW_SCAN = 10_000;
const MAX_SYNC_BATCH = 100;

export type ActionFailure = { ok: false; message: string; locked?: boolean };
export type SimpleResult = { ok: true } | ActionFailure;

export type UnlockActionResult =
  | { ok: true; status: EstablishResult["status"]; message?: string }
  | { ok: false; message: string };

export type EmailInfoResult =
  | { ok: true; email: string | null; emailConfirmed: boolean }
  | ActionFailure;

export type AppPasswordInfo = {
  name: string;
  createdAt: string;
  privileged?: boolean;
};

export type CreatedAppPassword = {
  name: string;
  password: string;
  createdAt: string;
};

function cleanHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/^@/, "").toLowerCase();
  if (!normalized || normalized.length > 253 || !FULL_HANDLE.test(normalized)) return null;
  return normalized;
}

function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 254 || !EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

function unlockMessage(status: EstablishResult["status"]): string | undefined {
  switch (status) {
    case "rateLimited":
      return "Too many attempts. Wait a few minutes before trying again.";
    case "unavailable":
      return "Unlock is temporarily unavailable. Please try again shortly.";
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Personal Account: Handle, Session Email Read, Password Reset
// ---------------------------------------------------------------------------

/** Reads the signed-in account's email via its OAuth session (or null if unavailable). */
export async function readOwnSessionInfo(): Promise<
  { ok: true; handle: string | null; email: string | null; emailConfirmed: boolean } | ActionFailure
> {
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
    const res = await callOAuthPds(session, "com.atproto.server.getSession");
    if (!res.ok) {
      return { ok: false, message: await readPdsError(res, "Couldn't read account details.") };
    }
    const data = (await res.json()) as {
      handle?: string;
      email?: string;
      emailConfirmed?: boolean;
    };
    return {
      ok: true,
      handle: typeof data.handle === "string" ? data.handle : null,
      email: typeof data.email === "string" ? data.email : null,
      emailConfirmed: Boolean(data.emailConfirmed),
    };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] readOwnSessionInfo failed", err);
    }
    return { ok: false, message: "Couldn't read account details right now." };
  }
}

/** Updates the signed-in account's handle (subdomain or verified custom domain). */
export async function updateOwnHandle(rawHandle: string): Promise<SimpleResult> {
  const handle = cleanHandle(rawHandle);
  if (!handle) return { ok: false, message: "Enter a valid handle or domain name." };
  try {
    assertWritesAllowed();
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    const res = await callOAuthPds(session, "com.atproto.identity.updateHandle", {
      method: "POST",
      body: { handle },
    });
    if (!res.ok) {
      return {
        ok: false,
        message: await readPdsError(
          res,
          "Couldn't update your handle. Check that it's available or that the DNS record has propagated.",
        ),
      };
    }
    updateTag(tags.actor(session.did));
    return { ok: true };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] updateOwnHandle failed", err);
    }
    return { ok: false, message: "Couldn't update your handle right now. Please try again." };
  }
}

/** Sends a password reset code to the signed-in user's email via their PDS. */
export async function requestOwnPasswordReset(rawEmail: string): Promise<SimpleResult> {
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, message: "Enter a valid email address." };
  try {
    assertWritesAllowed();
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    const res = await callPublicPds(session.did, "com.atproto.server.requestPasswordReset", {
      email,
    });
    if (!res.ok) {
      return { ok: false, message: await readPdsError(res, "Couldn't send the reset code.") };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] requestOwnPasswordReset failed", err);
    return { ok: false, message: "Couldn't send the reset code right now. Please try again." };
  }
}

/** Completes a personal password reset using the emailed code and a new password. */
export async function confirmOwnPasswordReset(input: {
  token: string;
  password: string;
}): Promise<SimpleResult> {
  const token = typeof input?.token === "string" ? input.token.trim() : "";
  const password = typeof input?.password === "string" ? input.password : "";
  if (!token) return { ok: false, message: "Enter the reset code from your email." };
  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  try {
    assertWritesAllowed();
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    const res = await callPublicPds(session.did, "com.atproto.server.resetPassword", {
      token,
      password,
    });
    if (!res.ok) {
      return { ok: false, message: await readPdsError(res, "Couldn't reset your password.") };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] confirmOwnPasswordReset failed", err);
    return { ok: false, message: "Couldn't reset your password right now. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Personal Elevated Session: Unlock / Lock, Email Update, App Passwords
// ---------------------------------------------------------------------------

/** Opens the short-lived elevated PDS password session for the signed-in user. */
export async function unlockPersonalSession(input: {
  password: string;
  authFactorToken?: string;
}): Promise<UnlockActionResult> {
  const password = typeof input?.password === "string" ? input.password : "";
  const authFactorToken =
    typeof input?.authFactorToken === "string" ? input.authFactorToken.trim() : undefined;
  if (!password) return { ok: false, message: "Enter your account password." };
  if (authFactorToken && authFactorToken.length > 256) {
    return { ok: false, message: "Invalid verification code." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    const result = await establishElevatedSession(
      { kind: "personal", callerDid: session.did },
      password,
      authFactorToken || undefined,
    );
    return { ok: true, status: result.status, message: unlockMessage(result.status) };
  } catch (err) {
    logError("[settings] unlockPersonalSession failed", err);
    return { ok: false, message: "Couldn't verify your password right now. Please try again." };
  }
}

/** Closes and revokes the caller's personal elevated PDS session. */
export async function lockPersonalSession(): Promise<SimpleResult> {
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: true };
    await endElevatedSession({ kind: "personal", callerDid: session.did });
    return { ok: true };
  } catch (err) {
    logError("[settings] lockPersonalSession failed", err);
    return { ok: false, message: "Couldn't lock the session right now." };
  }
}

async function personalScope(): Promise<
  { ok: true; scope: ElevatedScope; did: string } | ActionFailure
> {
  const session = await getOAuthSession();
  if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
  return { ok: true, scope: { kind: "personal", callerDid: session.did }, did: session.did };
}

/** Requests an email update on the personal PDS (sends confirmation code if required). */
export async function requestPersonalEmailUpdate(): Promise<
  { ok: true; tokenRequired: boolean } | ActionFailure
> {
  try {
    assertWritesAllowed();
    const s = await personalScope();
    if (!s.ok) return s;
    const r = await callElevatedPds(s.scope, "com.atproto.server.requestEmailUpdate", {
      method: "POST",
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't start the email change."),
      };
    }
    const data = (await r.response.json()) as { tokenRequired?: boolean };
    return { ok: true, tokenRequired: Boolean(data.tokenRequired) };
  } catch (err) {
    logError("[settings] requestPersonalEmailUpdate failed", err);
    return { ok: false, message: "Couldn't start the email change right now." };
  }
}

/** Saves a new email address on the personal PDS. */
export async function updatePersonalEmail(input: {
  email: string;
  token?: string;
}): Promise<SimpleResult> {
  const email = cleanEmail(input?.email);
  if (!email) return { ok: false, message: "Enter a valid email address." };
  const token = typeof input?.token === "string" ? input.token.trim() : "";
  try {
    assertWritesAllowed();
    const s = await personalScope();
    if (!s.ok) return s;
    const r = await callElevatedPds(s.scope, "com.atproto.server.updateEmail", {
      method: "POST",
      body: token ? { email, token } : { email },
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't update your email address."),
      };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] updatePersonalEmail failed", err);
    return { ok: false, message: "Couldn't update your email address right now." };
  }
}

/** Sends a confirmation code to the signed-in account's current email address. */
export async function requestPersonalEmailConfirmation(): Promise<SimpleResult> {
  try {
    assertWritesAllowed();
    const s = await personalScope();
    if (!s.ok) return s;
    const r = await callElevatedPds(s.scope, "com.atproto.server.requestEmailConfirmation", {
      method: "POST",
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't send the confirmation code."),
      };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] requestPersonalEmailConfirmation failed", err);
    return { ok: false, message: "Couldn't send the confirmation code right now." };
  }
}

/** Confirms the signed-in account's email address with the emailed code. */
export async function confirmPersonalEmail(input: {
  email: string;
  token: string;
}): Promise<SimpleResult> {
  const email = cleanEmail(input?.email);
  const token = typeof input?.token === "string" ? input.token.trim() : "";
  if (!email || !token) return { ok: false, message: "Enter your email and confirmation code." };
  try {
    assertWritesAllowed();
    const s = await personalScope();
    if (!s.ok) return s;
    const r = await callElevatedPds(s.scope, "com.atproto.server.confirmEmail", {
      method: "POST",
      body: { email, token },
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't confirm your email address."),
      };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] confirmPersonalEmail failed", err);
    return { ok: false, message: "Couldn't confirm your email address right now." };
  }
}

/** Lists existing ATProto app passwords via the caller's elevated session. */
export async function listPersonalAppPasswords(): Promise<
  { ok: true; passwords: AppPasswordInfo[] } | ActionFailure
> {
  try {
    const s = await personalScope();
    if (!s.ok) return s;
    const r = await callElevatedPds(s.scope, "com.atproto.server.listAppPasswords");
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't load your app passwords."),
      };
    }
    const data = (await r.response.json()) as { passwords?: AppPasswordInfo[] };
    return { ok: true, passwords: Array.isArray(data.passwords) ? data.passwords : [] };
  } catch (err) {
    logError("[settings] listPersonalAppPasswords failed", err);
    return { ok: false, message: "Couldn't load your app passwords right now." };
  }
}

/** Creates a new ATProto app password (the secret is returned once). */
export async function createPersonalAppPassword(
  rawName: string,
): Promise<{ ok: true; created: CreatedAppPassword } | ActionFailure> {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name || name.length > MAX_APP_PW_NAME) {
    return { ok: false, message: "Enter a name between 1 and 100 characters." };
  }
  try {
    assertWritesAllowed();
    const s = await personalScope();
    if (!s.ok) return s;
    const r = await callElevatedPds(s.scope, "com.atproto.server.createAppPassword", {
      method: "POST",
      body: { name },
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't create the app password."),
      };
    }
    const created = (await r.response.json()) as CreatedAppPassword;
    return { ok: true, created };
  } catch (err) {
    logError("[settings] createPersonalAppPassword failed", err);
    return { ok: false, message: "Couldn't create the app password right now." };
  }
}

/** Revokes an ATProto app password by name. */
export async function revokePersonalAppPassword(rawName: string): Promise<SimpleResult> {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name || name.length > MAX_APP_PW_NAME) {
    return { ok: false, message: "Invalid app password name." };
  }
  try {
    assertWritesAllowed();
    const s = await personalScope();
    if (!s.ok) return s;
    const r = await callElevatedPds(s.scope, "com.atproto.server.revokeAppPassword", {
      method: "POST",
      body: { name },
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't revoke the app password."),
      };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] revokePersonalAppPassword failed", err);
    return { ok: false, message: "Couldn't revoke the app password right now." };
  }
}

// ---------------------------------------------------------------------------
// Promote Personal Account into a CGS Group (`app.certified.group.import`)
// ---------------------------------------------------------------------------

export type PromoteToGroupResult =
  | { ok: true; status: "ok"; groupDid: string; handle: string }
  | {
      ok: true;
      status: "twoFactorRequired" | "invalidCode" | "invalid" | "rateLimited" | "unavailable";
      message?: string;
    }
  | { ok: false; message: string };

/**
 * Promotes the signed-in account into a CGS group.
 *
 * Uses the user's password once to open a temporary elevated session, mints a
 * dedicated app password for CGS (`Certified Group Service`), calls
 * `app.certified.group.import`, and tears down the elevated session. If the CGS
 * import fails, the minted app password is revoked so nothing is left behind;
 * on success it stays active because CGS stores it to act on the group's behalf.
 */
export async function promotePersonalAccountToGroup(input: {
  password: string;
  authFactorToken?: string;
}): Promise<PromoteToGroupResult> {
  const password = typeof input?.password === "string" ? input.password : "";
  const authFactorToken =
    typeof input?.authFactorToken === "string" ? input.authFactorToken.trim() : undefined;
  if (!password) return { ok: false, message: "Enter your account password." };

  try {
    assertWritesAllowed();
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    const scope: ElevatedScope = { kind: "personal", callerDid: session.did };
    const established = await establishElevatedSession(
      scope,
      password,
      authFactorToken || undefined,
    );
    if (established.status !== "ok") {
      return {
        ok: true,
        status: established.status,
        message: unlockMessage(established.status),
      };
    }

    const appPwName = `Certified Group Service (${Date.now().toString(36).slice(-4)})`;
    let mintedName: string | null = null;
    let imported: { groupDid: string; handle: string } | null = null;

    try {
      const createdRes = await callElevatedPds(scope, "com.atproto.server.createAppPassword", {
        method: "POST",
        body: { name: appPwName },
      });
      if (createdRes.kind === "locked" || !createdRes.response.ok) {
        const msg =
          createdRes.kind === "ok"
            ? await readPdsError(createdRes.response, "Couldn't prepare group credentials.")
            : "Your password session expired. Please try again.";
        return { ok: false, message: msg };
      }
      const created = (await createdRes.response.json()) as CreatedAppPassword;
      mintedName = created.name;

      imported = await importGroup(session, {
        appPassword: created.password,
        ownerDid: session.did,
      });
    } catch (err) {
      // Revoke the newly minted app password on failure so no orphan remains.
      if (mintedName) {
        await callElevatedPds(scope, "com.atproto.server.revokeAppPassword", {
          method: "POST",
          body: { name: mintedName },
        }).catch((revokeErr) => logError("[settings] import rollback revoke failed", revokeErr));
      }
      if (err instanceof XrpcResponseError) {
        if (err.error === "GroupAlreadyRegistered") {
          return { ok: false, message: "This account is already registered as a group." };
        }
        if (err.error === "InvalidAppPassword") {
          return {
            ok: false,
            message: "The group service couldn't verify the account credentials.",
          };
        }
        if (err.status >= 500) {
          return {
            ok: false,
            message: "We couldn't confirm whether the account became a group. Reload to check.",
          };
        }
      } else if (err instanceof XrpcError) {
        return {
          ok: false,
          message: "We couldn't confirm whether the account became a group. Reload to check.",
        };
      }
      if (!(err instanceof CgsAuthError)) {
        logError("[settings] promotePersonalAccountToGroup failed", err);
      }
      return {
        ok: false,
        message: "Couldn't turn this account into a group right now. Please try again.",
      };
    } finally {
      // Close the elevated password session so it doesn't linger after import.
      await endElevatedSession(scope).catch(() => {});
    }

    // Seed the organization marker record if missing (best-effort; group is already imported).
    try {
      await createOrganization(
        await sdkContext(session),
        { organization: {} },
        { repo: session.did },
      );
    } catch (err) {
      logError("[settings] organization marker after import failed", err, { did: session.did });
    }

    await forgetMemberships(session.did).catch((err) =>
      logError("[settings] failed to clear membership cache after import", err),
    );
    updateTag(tags.memberships(session.did));
    updateTag(tags.actor(session.did));
    updateTag(tags.explore());

    return { ok: true, status: "ok", groupDid: imported.groupDid, handle: imported.handle };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] promotePersonalAccountToGroup error", err);
    }
    return {
      ok: false,
      message: "Couldn't turn this account into a group right now. Please try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// Group Account PDS Management (Admin / Owner only, verified live against CGS)
// ---------------------------------------------------------------------------

async function groupAdminScope(
  groupDid: string,
): Promise<{ ok: true; scope: ElevatedScope; callerDid: string } | ActionFailure> {
  if (typeof groupDid !== "string" || !isDid(groupDid)) {
    return { ok: false, message: "Invalid group." };
  }
  const session = await getOAuthSession();
  if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
  if (!(await canEdit(session, groupDid))) {
    return { ok: false, message: "Only admins and owners can manage this group's account." };
  }
  return {
    ok: true,
    scope: { kind: "group", callerDid: session.did, groupDid },
    callerDid: session.did,
  };
}

/** Whether the caller already has an unlocked elevated session for `groupDid`. */
export async function getGroupAccountStatus(
  groupDid: string,
): Promise<{ ok: true; unlocked: boolean } | ActionFailure> {
  try {
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    return { ok: true, unlocked: await hasElevatedSession(g.scope) };
  } catch (err) {
    logError("[settings] getGroupAccountStatus failed", err, { groupDid });
    return { ok: false, message: "Couldn't check group unlock status." };
  }
}

/** Opens an elevated PDS session against `groupDid` with the group's password (admin/owner). */
export async function unlockGroupSession(
  groupDid: string,
  input: { password: string; authFactorToken?: string },
): Promise<UnlockActionResult> {
  const password = typeof input?.password === "string" ? input.password : "";
  const authFactorToken =
    typeof input?.authFactorToken === "string" ? input.authFactorToken.trim() : undefined;
  if (!password) return { ok: false, message: "Enter the group's password." };
  if (authFactorToken && authFactorToken.length > 256) {
    return { ok: false, message: "Invalid verification code." };
  }
  try {
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    const result = await establishElevatedSession(g.scope, password, authFactorToken || undefined);
    return { ok: true, status: result.status, message: unlockMessage(result.status) };
  } catch (err) {
    logError("[settings] unlockGroupSession failed", err, { groupDid });
    return { ok: false, message: "Couldn't verify the group's password right now." };
  }
}

/** Closes and revokes the elevated PDS session for `groupDid`. */
export async function lockGroupSession(groupDid: string): Promise<SimpleResult> {
  try {
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    await endElevatedSession(g.scope);
    return { ok: true };
  } catch (err) {
    logError("[settings] lockGroupSession failed", err, { groupDid });
    return { ok: false, message: "Couldn't lock the group session right now." };
  }
}

/** Reads the group account's sign-in email via the unlocked group session. */
export async function readGroupAccountEmail(groupDid: string): Promise<EmailInfoResult> {
  try {
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    const r = await callElevatedPds(g.scope, "com.atproto.server.getSession");
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't read the group's email."),
      };
    }
    const data = (await r.response.json()) as { email?: string; emailConfirmed?: boolean };
    return {
      ok: true,
      email: typeof data.email === "string" ? data.email : null,
      emailConfirmed: Boolean(data.emailConfirmed),
    };
  } catch (err) {
    logError("[settings] readGroupAccountEmail failed", err, { groupDid });
    return { ok: false, message: "Couldn't read the group's email right now." };
  }
}

/** Updates a non-self group's handle via its unlocked PDS session. */
export async function updateGroupAccountHandle(
  groupDid: string,
  rawHandle: string,
): Promise<SimpleResult> {
  const handle = cleanHandle(rawHandle);
  if (!handle) return { ok: false, message: "Enter a valid handle or domain name." };
  try {
    assertWritesAllowed();
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    const r = await callElevatedPds(g.scope, "com.atproto.identity.updateHandle", {
      method: "POST",
      body: { handle },
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't update the group's handle."),
      };
    }
    updateTag(tags.actor(groupDid));
    return { ok: true };
  } catch (err) {
    logError("[settings] updateGroupAccountHandle failed", err, { groupDid });
    return { ok: false, message: "Couldn't update the group's handle right now." };
  }
}

/** Requests an email update for a non-self group via its unlocked PDS session. */
export async function requestGroupAccountEmailUpdate(
  groupDid: string,
): Promise<{ ok: true; tokenRequired: boolean } | ActionFailure> {
  try {
    assertWritesAllowed();
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    const r = await callElevatedPds(g.scope, "com.atproto.server.requestEmailUpdate", {
      method: "POST",
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't start the email change."),
      };
    }
    const data = (await r.response.json()) as { tokenRequired?: boolean };
    return { ok: true, tokenRequired: Boolean(data.tokenRequired) };
  } catch (err) {
    logError("[settings] requestGroupAccountEmailUpdate failed", err, { groupDid });
    return { ok: false, message: "Couldn't start the email change right now." };
  }
}

/** Saves a new email address for a non-self group via its unlocked PDS session. */
export async function updateGroupAccountEmail(
  groupDid: string,
  input: { email: string; token?: string },
): Promise<SimpleResult> {
  const email = cleanEmail(input?.email);
  if (!email) return { ok: false, message: "Enter a valid email address." };
  const token = typeof input?.token === "string" ? input.token.trim() : "";
  try {
    assertWritesAllowed();
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    const r = await callElevatedPds(g.scope, "com.atproto.server.updateEmail", {
      method: "POST",
      body: token ? { email, token } : { email },
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't update the group's email."),
      };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] updateGroupAccountEmail failed", err, { groupDid });
    return { ok: false, message: "Couldn't update the group's email right now." };
  }
}

/** Requests email confirmation for a non-self group's current email. */
export async function requestGroupAccountEmailConfirmation(
  groupDid: string,
): Promise<SimpleResult> {
  try {
    assertWritesAllowed();
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    const r = await callElevatedPds(g.scope, "com.atproto.server.requestEmailConfirmation", {
      method: "POST",
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't send the confirmation code."),
      };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] requestGroupAccountEmailConfirmation failed", err, { groupDid });
    return { ok: false, message: "Couldn't send the confirmation code right now." };
  }
}

/** Confirms a non-self group's email with the emailed code. */
export async function confirmGroupAccountEmail(
  groupDid: string,
  input: { email: string; token: string },
): Promise<SimpleResult> {
  const email = cleanEmail(input?.email);
  const token = typeof input?.token === "string" ? input.token.trim() : "";
  if (!email || !token) return { ok: false, message: "Enter the email and confirmation code." };
  try {
    assertWritesAllowed();
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    const r = await callElevatedPds(g.scope, "com.atproto.server.confirmEmail", {
      method: "POST",
      body: { email, token },
    });
    if (r.kind === "locked") return { ok: false, locked: true, message: "Unlock to continue." };
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't confirm the group's email."),
      };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] confirmGroupAccountEmail failed", err, { groupDid });
    return { ok: false, message: "Couldn't confirm the group's email right now." };
  }
}

/** Requests a password reset code for a non-self group's mailbox (admin/owner). */
export async function requestGroupAccountPasswordReset(
  groupDid: string,
  rawEmail: string,
): Promise<SimpleResult> {
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, message: "Enter a valid email address." };
  try {
    assertWritesAllowed();
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    const res = await callPublicPds(groupDid, "com.atproto.server.requestPasswordReset", { email });
    if (!res.ok) {
      return { ok: false, message: await readPdsError(res, "Couldn't send the reset code.") };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] requestGroupAccountPasswordReset failed", err, { groupDid });
    return { ok: false, message: "Couldn't send the reset code right now." };
  }
}

/**
 * Resets a non-self group's password with the emailed code, then verifies that
 * the reset actually applied to `groupDid` (not a different account whose email
 * was entered by mistake).
 */
export async function confirmGroupAccountPasswordReset(
  groupDid: string,
  input: { token: string; password: string },
): Promise<SimpleResult> {
  const token = typeof input?.token === "string" ? input.token.trim() : "";
  const password = typeof input?.password === "string" ? input.password : "";
  if (!token) return { ok: false, message: "Enter the reset code from the email." };
  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  try {
    assertWritesAllowed();
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;

    const res = await callPublicPds(groupDid, "com.atproto.server.resetPassword", {
      token,
      password,
    });
    if (!res.ok) {
      return {
        ok: false,
        message: await readPdsError(res, "Couldn't reset the group's password."),
      };
    }

    const appliedToGroup = await verifyGroupPassword(groupDid, password).catch(() => true);
    if (!appliedToGroup) {
      return {
        ok: false,
        message:
          "That reset code belonged to a different account, not this group — so that account's password changed, but this group's password did not. Enter the group's own sign-in email.",
      };
    }
    return { ok: true };
  } catch (err) {
    logError("[settings] confirmGroupAccountPasswordReset failed", err, { groupDid });
    return { ok: false, message: "Couldn't reset the group's password right now." };
  }
}

// ---------------------------------------------------------------------------
// Social Graph Sync (Certified <-> Bluesky follows)
// ---------------------------------------------------------------------------

export type SocialGraphComparison = {
  certifiedCount: number;
  blueskyCount: number;
  inBothCount: number;
  onlyBluesky: ActorCard[];
  onlyCertified: ActorCard[];
  certifiedTruncated: boolean;
  blueskyTruncated: boolean;
};

export type SocialGraphSyncBatchResult = {
  ok: true;
  imported: number;
  failed: number;
  errors: { subjectDid: string; message: string }[];
};

function extractSubjectDid(value: Record<string, unknown>): string | null {
  const subject = value.subject;
  if (typeof subject === "string" && isDid(subject)) return subject;
  if (subject && typeof subject === "object") {
    const did = (subject as { did?: unknown }).did;
    if (typeof did === "string" && isDid(did)) return did;
  }
  return null;
}

async function listFollowSubjects(
  repo: Awaited<ReturnType<typeof repositoryFor>>,
  collection: l.NsidString,
): Promise<{ subjects: Set<string>; truncated: boolean }> {
  const subjects = new Set<string>();
  let cursor: string | undefined;
  let scanned = 0;
  let truncated = false;
  while (scanned < MAX_FOLLOW_SCAN) {
    const page = await repo.listRecords(collection, { limit: 100, cursor });
    for (const record of page.records) {
      scanned++;
      const did = extractSubjectDid(record.value);
      if (did) subjects.add(did);
    }
    if (!page.cursor || page.cursor === cursor) break;
    cursor = page.cursor;
    if (scanned >= MAX_FOLLOW_SCAN) {
      truncated = true;
      break;
    }
  }
  return { subjects, truncated };
}

/**
 * Compares `repoDid`'s Certified follows (`app.certified.graph.follow`) with
 * its Bluesky follows (`app.bsky.graph.follow`) directly from its PDS.
 */
export async function compareSocialGraph(
  repoDid: string,
): Promise<({ ok: true } & SocialGraphComparison) | ActionFailure> {
  if (typeof repoDid !== "string" || !isDid(repoDid)) {
    return { ok: false, message: "Invalid account." };
  }
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
    if (!(await isMember(session, repoDid))) {
      return { ok: false, message: "You don't have access to sync this account's follows." };
    }

    const repo = await repositoryFor(session, repoDid as l.DidString);
    const [certified, bluesky] = await Promise.all([
      listFollowSubjects(repo, "app.certified.graph.follow"),
      listFollowSubjects(repo, "app.bsky.graph.follow"),
    ]);

    let inBothCount = 0;
    const onlyCertifiedDids: string[] = [];
    const onlyBlueskyDids: string[] = [];
    for (const did of certified.subjects) {
      if (bluesky.subjects.has(did)) inBothCount++;
      else onlyCertifiedDids.push(did);
    }
    for (const did of bluesky.subjects) {
      if (!certified.subjects.has(did)) onlyBlueskyDids.push(did);
    }

    // Resolve actor cards in bounded chunks for display in the pick modal.
    const allCandidateDids = [...new Set([...onlyBlueskyDids, ...onlyCertifiedDids])];
    const cardsByDid = new Map<string, ActorCard>();
    for (let i = 0; i < allCandidateDids.length; i += 100) {
      const slice = allCandidateDids.slice(i, i + 100);
      const cards = await getActorCards(slice);
      for (const card of cards) cardsByDid.set(card.did, card);
    }
    const toCard = (did: string): ActorCard =>
      cardsByDid.get(did) ?? {
        did,
        handle: null,
        displayName: did,
        description: null,
        avatarUrl: null,
        isOrganization: false,
      };

    return {
      ok: true,
      certifiedCount: certified.subjects.size,
      blueskyCount: bluesky.subjects.size,
      inBothCount,
      onlyBluesky: onlyBlueskyDids.map(toCard),
      onlyCertified: onlyCertifiedDids.map(toCard),
      certifiedTruncated: certified.truncated,
      blueskyTruncated: bluesky.truncated,
    };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] compareSocialGraph failed", err, { repoDid });
    }
    return { ok: false, message: "Couldn't compare your follow graphs right now." };
  }
}

/**
 * Imports selected Bluesky follows into `repoDid`'s Certified graph using
 * `@hypercerts-org/sdk/social` (`followAccount`).
 */
export async function importBlueskyFollows(
  repoDid: string,
  subjectDids: string[],
): Promise<SocialGraphSyncBatchResult | ActionFailure> {
  if (typeof repoDid !== "string" || !isDid(repoDid) || !Array.isArray(subjectDids)) {
    return { ok: false, message: "Invalid sync request." };
  }
  const uniqueDids = [...new Set(subjectDids)]
    .filter((did): did is string => typeof did === "string" && isDid(did) && did !== repoDid)
    .slice(0, MAX_SYNC_BATCH);
  if (uniqueDids.length === 0) {
    return { ok: true, imported: 0, failed: 0, errors: [] };
  }

  try {
    assertWritesAllowed();
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
    if (!(await isMember(session, repoDid))) {
      return { ok: false, message: "You don't have permission to follow as this account." };
    }

    const context = await sdkContext(session);
    const repoOpt = writeTo(session, repoDid);
    let imported = 0;
    const errors: { subjectDid: string; message: string }[] = [];

    for (const subjectDid of uniqueDids) {
      try {
        await followAccount(context, { subject: { did: subjectDid } }, repoOpt);
        imported++;
      } catch (err) {
        logError("[settings] importBlueskyFollow failed", err, { repoDid, subjectDid });
        errors.push({ subjectDid, message: "Couldn't import this follow." });
      }
    }

    if (imported > 0) {
      updateTag(tags.follows(repoDid));
      updateTag(tags.actor(repoDid));
    }
    return { ok: true, imported, failed: errors.length, errors };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] importBlueskyFollows failed", err, { repoDid });
    }
    return { ok: false, message: "Couldn't import follows right now. Please try again." };
  }
}

/**
 * Exports selected Certified follows to the signed-in user's Bluesky graph
 * (`app.bsky.graph.follow`). Personal accounts only.
 */
export async function exportCertifiedFollowsToBluesky(
  subjectDids: string[],
): Promise<SocialGraphSyncBatchResult | ActionFailure> {
  if (!Array.isArray(subjectDids)) {
    return { ok: false, message: "Invalid sync request." };
  }
  try {
    assertWritesAllowed();
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    const uniqueDids = [...new Set(subjectDids)]
      .filter((did): did is string => typeof did === "string" && isDid(did) && did !== session.did)
      .slice(0, MAX_SYNC_BATCH);
    if (uniqueDids.length === 0) {
      return { ok: true, imported: 0, failed: 0, errors: [] };
    }

    let imported = 0;
    const errors: { subjectDid: string; message: string }[] = [];

    for (const subjectDid of uniqueDids) {
      try {
        const res = await callOAuthPds(session, "com.atproto.repo.createRecord", {
          method: "POST",
          body: {
            repo: session.did,
            collection: "app.bsky.graph.follow",
            record: {
              $type: "app.bsky.graph.follow",
              subject: subjectDid,
              createdAt: currentDatetimeString(),
            },
          },
        });
        if (!res.ok) {
          errors.push({ subjectDid, message: "Couldn't add this follow on Bluesky." });
        } else {
          imported++;
        }
      } catch (err) {
        logError("[settings] exportCertifiedFollow failed", err, { subjectDid });
        errors.push({ subjectDid, message: "Couldn't add this follow on Bluesky." });
      }
    }

    return { ok: true, imported, failed: errors.length, errors };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) {
      logError("[settings] exportCertifiedFollowsToBluesky failed", err);
    }
    return { ok: false, message: "Couldn't export follows right now. Please try again." };
  }
}
