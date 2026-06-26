"use client"

import { useCallback, useEffect, useState } from "react"
import { useOrg } from "@/lib/groups/org-context"
import { importGroup, RegisterGroupError } from "@/lib/groups/api"
import { createAppPassword, revokeAppPassword } from "@/lib/atproto/app-passwords"
import { authFetch } from "@/lib/auth/fetch"
import { GROUP_PROMOTED_FLAG } from "@/lib/groups/constants"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"
import {
  useUnlockAppPasswords,
  UnlockAppPasswordFields,
} from "./unlock-app-passwords-fields"

/**
 * Settings section that promotes the signed-in account into a Certified group
 * via the CGS `app.certified.group.import` procedure (wrapped by
 * `importGroup`). The account being converted is always the one you're signed
 * in as — CGS requires the service-auth token's `iss` to equal the imported
 * account.
 *
 * The import needs an app password of the account being imported. Rather than
 * make the user mint and paste one, this collects only the **account
 * password** (+ emailed 2FA code if enabled, via the shared unlock fields):
 * on unlock it mints a throwaway app password in the background, imports with
 * it, then revokes it — so the credential is never shown or kept.
 *
 * Unlike the standalone `/groups/import` page, this stays inline (no
 * redirect): on success it shows a confirmation and the new group appears in
 * the account switcher via `refetchOrgs`.
 */
export default function ImportAsGroupSection({ did }: { did: string }) {
  const { refetchOrgs } = useOrg()
  const [handle, setHandle] = useState<string | null>(null)
  // True while minting the app password → importing → revoking, after a
  // successful unlock. Separate from the unlock hook's own `submitting`.
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolve the signed-in account's handle so the copy can name which
  // account gets converted.
  useEffect(() => {
    let cancelled = false
    authFetch(`/api/resolve-did?did=${encodeURIComponent(did)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.handle) setHandle(data.handle as string)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [did])

  // Runs once the account password (+ 2FA) has opened the elevated session:
  // mint a one-time app password, import with it, then revoke it no matter
  // what so nothing is left behind.
  const runImport = useCallback(async () => {
    setWorking(true)
    setError(null)
    let appPwName: string | null = null
    let promotedHandle: string | null = null
    try {
      const created = await createAppPassword(
        `group-import-${Math.random().toString(36).slice(2, 8)}`,
      )
      appPwName = created.name
      const result = await importGroup(created.password)
      promotedHandle = result.handle || handle
    } catch (err) {
      if (
        err instanceof RegisterGroupError &&
        err.code === "GroupAlreadyRegistered"
      ) {
        setError("This account is already registered as a group.")
      } else {
        setError(err instanceof Error ? err.message : "Import failed")
      }
    } finally {
      // Revoke the throwaway app password — on success and on failure.
      if (appPwName) {
        try {
          await revokeAppPassword(appPwName)
        } catch (err) {
          console.error("[settings/import-group] revoke failed", err)
        }
      }
    }

    // On success, hand off to the group settings: flag the celebration, point
    // the hash at #members, then refetch so the panel swaps to OrgSettings —
    // which reads the flag on arrival and shows the celebration there. Keep
    // `working` true so the button stays spinning through the redirect (the
    // panel swap unmounts this component); only re-enable it on failure.
    if (promotedHandle) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(GROUP_PROMOTED_FLAG, promotedHandle)
        window.location.hash = "members"
      }
      await refetchOrgs()
    } else {
      setWorking(false)
    }
  }, [handle, refetchOrgs])

  const unlock = useUnlockAppPasswords(() => void runImport())

  const accountLabel = handle ? `@${handle}` : did
  const busy = unlock.submitting || working

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void unlock.submit()
      }}
      className="import-group"
    >
      <p className="text-sm text-[var(--fg-secondary)]">
        Converts the account you&apos;re signed in as —{" "}
        <strong>{accountLabel}</strong> — into a group, with you as its owner.
        The account, its handle, and its records are kept; nothing is deleted.
      </p>

      <UnlockAppPasswordFields
        state={unlock}
        intro="Enter your account password to authorize the promotion. We create a one-time app password in the background and revoke it as soon as the group is created — nothing is shown or stored."
      />

      {error && <ErrorMessage message={error} />}

      <div className="import-group__actions">
        <Button
          type="submit"
          variant="primary"
          loading={busy}
          disabled={!unlock.canSubmit || busy}
        >
          Promote to group
        </Button>
      </div>
    </form>
  )
}
