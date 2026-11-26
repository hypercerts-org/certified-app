"use server";

// Server Action for promoting the signed-in personal account into a CGS group
// (`app.certified.group.import`).

import { XrpcError, XrpcResponseError } from "@atproto/lex";
import { createOrganization } from "@hypercerts-org/sdk/organization";
import { updateTag } from "next/cache";
import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import {
  callElevatedPds,
  type ElevatedScope,
  endElevatedSession,
  establishElevatedSession,
  readPdsError,
} from "@/lib/auth/elevated-session";
import { CgsAuthError, forgetMemberships, importGroup } from "@/lib/cgs";
import { tags } from "@/lib/hypercerts/cache";
import { sdkContext } from "@/lib/hypercerts/sdk";
import { logError } from "@/lib/log";
import { unlockMessage } from "./scope";
import type { CreatedAppPassword, PromoteToGroupResult } from "./types";

/**
 * Promotes the signed-in account into a CGS group.
 *
 * Uses the user's password once to open a temporary elevated session, mints a
 * dedicated app password for CGS (`Certified Group Service`), calls
 * `app.certified.group.import`, and tears down the elevated session. If the CGS
 * import is definitely refused (4xx or pre-call auth error), the minted app
 * password is revoked so nothing is left behind; on 5xx/timeouts or success it
 * stays active because CGS may have stored it to act on the group's behalf.
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
      // Only revoke the minted app password when we know CGS did NOT commit
      // the import (4xx refusal or service-auth failure before CGS was called).
      // On 5xx/timeouts CGS may have stored the password already; revoking it
      // would brick the newly imported group.
      const definitelyNotCommitted =
        err instanceof CgsAuthError ||
        (err instanceof XrpcResponseError && err.status >= 400 && err.status < 500);
      if (mintedName && definitelyNotCommitted) {
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
