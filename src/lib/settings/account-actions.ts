"use server";

// Server Actions for Personal & Group Account Settings:
// handle updates, password resets, elevated PDS sessions (Valkey-backed, 10m TTL),
// and email management (personal and non-self group accounts share the same
// elevated PDS helpers).

import { updateTag } from "next/cache";
import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import {
  callElevatedPds,
  callOAuthPds,
  callPublicPds,
  type ElevatedScope,
  endElevatedSession,
  establishElevatedSession,
  hasElevatedSession,
  readPdsError,
  verifyGroupPassword,
} from "@/lib/auth/elevated-session";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { resolveHandleFresh } from "@/lib/identity";
import { logError } from "@/lib/log";
import { cleanEmail, cleanHandle, groupAdminScope, personalScope, unlockMessage } from "./scope";
import type { ActionFailure, EmailInfoResult, SimpleResult, UnlockActionResult } from "./types";

const LOCKED: ActionFailure = { ok: false, locked: true, message: "Unlock to continue." };

// ---------------------------------------------------------------------------
// Shared elevated-PDS email helpers (used by both personal and group actions)
// ---------------------------------------------------------------------------

async function runRequestEmailUpdate(
  scope: ElevatedScope,
): Promise<{ ok: true; tokenRequired: boolean } | ActionFailure> {
  const r = await callElevatedPds(scope, "com.atproto.server.requestEmailUpdate", {
    method: "POST",
  });
  if (r.kind === "locked") return LOCKED;
  if (!r.response.ok) {
    return {
      ok: false,
      message: await readPdsError(r.response, "Couldn't start the email change."),
    };
  }
  const data = (await r.response.json()) as { tokenRequired?: boolean };
  return { ok: true, tokenRequired: Boolean(data.tokenRequired) };
}

async function runUpdateEmail(
  scope: ElevatedScope,
  email: string,
  token: string,
  fallbackError: string,
): Promise<SimpleResult> {
  const r = await callElevatedPds(scope, "com.atproto.server.updateEmail", {
    method: "POST",
    body: token ? { email, token } : { email },
  });
  if (r.kind === "locked") return LOCKED;
  if (!r.response.ok) {
    return { ok: false, message: await readPdsError(r.response, fallbackError) };
  }
  return { ok: true };
}

async function runRequestEmailConfirmation(scope: ElevatedScope): Promise<SimpleResult> {
  const r = await callElevatedPds(scope, "com.atproto.server.requestEmailConfirmation", {
    method: "POST",
  });
  if (r.kind === "locked") return LOCKED;
  if (!r.response.ok) {
    return {
      ok: false,
      message: await readPdsError(r.response, "Couldn't send the confirmation code."),
    };
  }
  return { ok: true };
}

async function runConfirmEmail(
  scope: ElevatedScope,
  email: string,
  token: string,
  fallbackError: string,
): Promise<SimpleResult> {
  const r = await callElevatedPds(scope, "com.atproto.server.confirmEmail", {
    method: "POST",
    body: { email, token },
  });
  if (r.kind === "locked") return LOCKED;
  if (!r.response.ok) {
    return { ok: false, message: await readPdsError(r.response, fallbackError) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Personal Account: Handle, Password Reset, Unlock / Lock, Email
// ---------------------------------------------------------------------------

/** Updates the signed-in account's handle (subdomain or verified custom domain). */
export async function updateOwnHandle(rawHandle: string): Promise<SimpleResult> {
  const handle = cleanHandle(rawHandle);
  if (!handle) return { ok: false, message: "Enter a valid handle or domain name." };
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false, message: "Your session has ended. Sign in again." };

    const res = await callOAuthPds(session, "com.atproto.identity.updateHandle", {
      method: "POST",
      body: { handle },
    });
    if (!res.ok) {
      const pdsMessage = await readPdsError(
        res,
        "Couldn't update your handle. Check that it's available or that the DNS record has propagated.",
      );
      if (/missing required scope/i.test(pdsMessage)) {
        return {
          ok: false,
          message:
            "Your current sign-in doesn't have permission to change your handle. Sign out and sign back in, then try again.",
        };
      }
      return { ok: false, message: pdsMessage };
    }
    await waitForIndex(async () => (await resolveHandleFresh(session.did)) === handle, 5_000);
    updateTag(tags.actor(session.did));
    updateTag(tags.handle(handle));
    updateTag(tags.explore());
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

/** Requests an email update on the personal PDS (sends confirmation code if required). */
export async function requestPersonalEmailUpdate(): Promise<
  { ok: true; tokenRequired: boolean } | ActionFailure
> {
  try {
    const s = await personalScope();
    if (!s.ok) return s;
    return await runRequestEmailUpdate(s.scope);
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
    const s = await personalScope();
    if (!s.ok) return s;
    return await runUpdateEmail(s.scope, email, token, "Couldn't update your email address.");
  } catch (err) {
    logError("[settings] updatePersonalEmail failed", err);
    return { ok: false, message: "Couldn't update your email address right now." };
  }
}

/** Sends a confirmation code to the signed-in account's current email address. */
export async function requestPersonalEmailConfirmation(): Promise<SimpleResult> {
  try {
    const s = await personalScope();
    if (!s.ok) return s;
    return await runRequestEmailConfirmation(s.scope);
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
    const s = await personalScope();
    if (!s.ok) return s;
    return await runConfirmEmail(s.scope, email, token, "Couldn't confirm your email address.");
  } catch (err) {
    logError("[settings] confirmPersonalEmail failed", err);
    return { ok: false, message: "Couldn't confirm your email address right now." };
  }
}

// ---------------------------------------------------------------------------
// Group Account PDS Management (Admin / Owner only, verified live against CGS)
// ---------------------------------------------------------------------------

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
    if (r.kind === "locked") return LOCKED;
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
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    const r = await callElevatedPds(g.scope, "com.atproto.identity.updateHandle", {
      method: "POST",
      body: { handle },
    });
    if (r.kind === "locked") return LOCKED;
    if (!r.response.ok) {
      return {
        ok: false,
        message: await readPdsError(r.response, "Couldn't update the group's handle."),
      };
    }
    await waitForIndex(async () => (await resolveHandleFresh(groupDid)) === handle, 5_000);
    updateTag(tags.actor(groupDid));
    updateTag(tags.handle(handle));
    updateTag(tags.explore());
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
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    return await runRequestEmailUpdate(g.scope);
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
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    return await runUpdateEmail(g.scope, email, token, "Couldn't update the group's email.");
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
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    return await runRequestEmailConfirmation(g.scope);
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
    const g = await groupAdminScope(groupDid);
    if (!g.ok) return g;
    return await runConfirmEmail(g.scope, email, token, "Couldn't confirm the group's email.");
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
