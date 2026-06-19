"use client"

import { useCallback, useEffect, useState } from "react"
import { KeyRound } from "lucide-react"
import { useOrg } from "@/lib/groups/org-context"
import { importGroup, putMembership, RegisterGroupError } from "@/lib/groups/api"
import { authFetch } from "@/lib/auth/fetch"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import ErrorMessage from "@/components/ui/error-message"

/**
 * Settings section that promotes the signed-in account into a Certified
 * group via the CGS `app.certified.group.import` procedure (wrapped by
 * `importGroup`). The account being converted is always the one you're
 * signed in as — CGS requires the service-auth token's `iss` to equal the
 * imported account — so the copy names it explicitly and tells you to sign
 * in as a different account if you meant to convert that one instead.
 *
 * Unlike the standalone `/groups/import` page, this stays inline (no
 * redirect): on success it shows a confirmation and the new group appears
 * in the account switcher via `refetchOrgs`.
 */
export default function ImportAsGroupSection({ did }: { did: string }) {
  const { refetchOrgs } = useOrg()
  const [handle, setHandle] = useState<string | null>(null)
  const [appPassword, setAppPassword] = useState("")
  const [isImporting, setIsImporting] = useState(false)
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

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      if (!appPassword.trim() || isImporting) return
      setIsImporting(true)
      setError(null)
      try {
        const result = await importGroup(appPassword.trim())
        // Stitch the owner membership marker so the imported group shows up
        // in the account switcher + group list (mirrors the create flow).
        try {
          await putMembership(did, result.groupDid, "owner")
        } catch (err) {
          console.error("[settings/import-group] putMembership failed", err)
        }
        await refetchOrgs()
        setImportedHandle(result.handle || handle)
        setAppPassword("")
      } catch (err) {
        if (
          err instanceof RegisterGroupError &&
          err.code === "GroupAlreadyRegistered"
        ) {
          setError("This account is already registered as a group.")
        } else if (
          err instanceof RegisterGroupError &&
          err.code === "InvalidAppPassword"
        ) {
          setError("That app password was not accepted. Check it and try again.")
        } else {
          setError(err instanceof Error ? err.message : "Import failed")
        }
      } finally {
        setIsImporting(false)
      }
    },
    [did, appPassword, isImporting, refetchOrgs, handle],
  )

  if (importedHandle) {
    return (
      <p className="settings__note" role="status">
        ✓ <strong>@{importedHandle}</strong> is now a group, with you as its
        owner. Switch to it from the account menu to manage members and roles.
      </p>
    )
  }

  const accountLabel = handle ? `@${handle}` : did

  return (
    <form onSubmit={handleSubmit}>
      <p className="settings__note">
        Converts the account you&apos;re signed in as —{" "}
        <strong>{accountLabel}</strong> — into a group, with you as its owner.
        The account, its handle, and its records are kept; nothing is deleted.
      </p>

      <Input
        type="password"
        label="App password"
        size="md"
        autoComplete="off"
        leadingIcon={<KeyRound size={16} aria-hidden="true" />}
        placeholder="xxxx-xxxx-xxxx-xxxx"
        value={appPassword}
        onChange={(e) => setAppPassword(e.target.value)}
      />
      <p className="settings__note">
        Create an app password in your account&apos;s settings. It&apos;s stored
        encrypted so the service can act for the group; you can revoke it
        anytime.
      </p>

      {error && <ErrorMessage message={error} />}

      <div className="org-members__add-submit">
        <Button
          type="submit"
          variant="primary"
          loading={isImporting}
          disabled={!appPassword.trim() || isImporting}
        >
          Import as group
        </Button>
      </div>
    </form>
  )
}
