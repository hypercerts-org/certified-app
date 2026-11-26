import "server-only";

import { getOAuthSession } from "@/lib/auth/dal";
import type { ElevatedScope, EstablishResult } from "@/lib/auth/elevated-session";
import { canEdit } from "@/lib/cgs";
import { isDid, isEmail, isHandle } from "@/lib/validate";
import type { ActionFailure } from "./types";

export function cleanHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/^@/, "").toLowerCase();
  return isHandle(normalized) ? normalized : null;
}

export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return isEmail(trimmed) ? trimmed : null;
}

export function unlockMessage(status: EstablishResult["status"]): string | undefined {
  switch (status) {
    case "rateLimited":
      return "Too many attempts. Wait a few minutes before trying again.";
    case "unavailable":
      return "Unlock is temporarily unavailable. Please try again shortly.";
    default:
      return undefined;
  }
}

export async function personalScope(): Promise<
  { ok: true; scope: ElevatedScope; did: string } | ActionFailure
> {
  const session = await getOAuthSession();
  if (!session) return { ok: false, message: "Your session has ended. Sign in again." };
  return { ok: true, scope: { kind: "personal", callerDid: session.did }, did: session.did };
}

export async function groupAdminScope(
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
