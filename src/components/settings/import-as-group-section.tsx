"use client"

import { useCallback, useEffect, useState } from "react"
import { useOrg } from "@/lib/groups/org-context"
import { importGroup, RegisterGroupError } from "@/lib/groups/api"
import { createAppPassword, revokeAppPassword } from "@/lib/atproto/app-passwords"
import { authFetch } from "@/lib/auth/fetch"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"
import GroupResultModal from "@/components/groups/group-result-modal"
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
  const [importedHandle, setImportedHandle] = useState<string | null>(null)

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
    try {
      const created = await createAppPassword(
        `group-import-${Math.random().toString(36).slice(2, 8)}`,
      )
      appPwName = created.name
      const result = await importGroup(created.password)
      // Show the celebration first; refetch + switch to the group on dismiss
      // (refetching now would swap this panel for the group settings and
      // unmount the modal before it's seen).
      setImportedHandle(result.handle || handle)
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
      setWorking(false)
    }
  }, [handle])

  const unlock = useUnlockAppPasswords(() => void runImport())

  // Dismiss the celebration: now sync (the account is a group → selfGroup) and
  // jump to the group's members page.
  const goToGroup = useCallback(() => {
    if (typeof window !== "undefined") window.location.hash = "members"
    void refetchOrgs()
  }, [refetchOrgs])

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

      {importedHandle ? (
        <GroupResultModal
          variant="created"
          handle={importedHandle}
          primaryLabel="Manage your group"
          onPrimary={goToGroup}
          onClose={goToGroup}
        />
      ) : null}
    </form>
  )
}
