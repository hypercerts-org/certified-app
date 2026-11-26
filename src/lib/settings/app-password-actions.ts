"use server";

// Server Actions for ATProto App Passwords (personal elevated PDS session).

import { callElevatedPds, readPdsError } from "@/lib/auth/elevated-session";
import { logError } from "@/lib/log";
import { personalScope } from "./scope";
import type { ActionFailure, AppPasswordInfo, CreatedAppPassword, SimpleResult } from "./types";

const MAX_APP_PW_NAME = 100;

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
