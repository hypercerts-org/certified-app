"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Users } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { usePageTitle } from "@/lib/navbar-context"
import { importGroup, RegisterGroupError } from "@/lib/groups/api"
import { authFetch } from "@/lib/auth/fetch"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import EmptyState from "@/components/ui/empty-state"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"

/**
 * `/groups/import` — promote an EXISTING atproto account into a group
 * (the sibling of `/groups/create`, which mints a brand-new account).
 *
 * Key constraint (CGS `app.certified.group.import`): the service-auth
 * JWT must be signed by the account being imported, so the account that
 * gets converted is always **the one you're currently signed in as**.
 * The page makes that explicit so a user can't accidentally convert the
 * wrong account — to import a different account, sign in as that account
 * first. The signed-in user becomes the group's owner.
 *
 * The caller supplies an app password for the account (CGS stores it
 * encrypted to act on the account's behalf). After import we stitch the
 * owner membership marker so the group appears in the account switcher,
 * mirroring the create flow's final step.
 */
export default function ImportGroupPage() {
  usePageTitle("Import account as group")
  const router = useRouter()
  const { did, isLoading: authLoading, openSignIn } = useAuth()
  const { refetchOrgs } = useOrg()

  const [handle, setHandle] = useState<string | null>(null)
  const [appPassword, setAppPassword] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolve the signed-in account's handle so the "which account gets
  // converted" warning names it explicitly.
  useEffect(() => {
    if (!did) return
    let cancelled = false
    authFetch(`/api/resolve-did?did=${encodeURIComponent(did)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.handle) setHandle(data.handle)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [did])

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      if (!did || !appPassword.trim() || isImporting) return
      setIsImporting(true)
      setError(null)
      try {
        await importGroup(appPassword.trim())
        await refetchOrgs()
        router.push("/home")
      } catch (err) {
        if (err instanceof RegisterGroupError && err.code === "GroupAlreadyRegistered") {
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
    [did, appPassword, isImporting, refetchOrgs, router],
  )

  if (authLoading) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <LoadingSpinner size="sm" />
          </div>
        </div>
      </div>
    )
  }

  if (!did) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={Users}
              title="Sign in to promote an account"
              description="Sign in as the account you want to promote to a group."
            >
              <Button variant="primary" onClick={() => openSignIn()}>
                Sign in
              </Button>
            </EmptyState>
          </div>
        </div>
      </div>
    )
  }

  const accountLabel = handle ? `@${handle}` : did

  return (
    <div className="dashboard">
      <div className="dashboard__body">
        <div className="dashboard__main">
          <form className="cert-detail__section" onSubmit={handleSubmit}>
            <header className="sx-panel__header">
              <h1 className="sx-panel__title">Promote an account to a group</h1>
              <p className="sx-panel__desc">
                This converts the account you&apos;re signed in as —{" "}
                <strong>{accountLabel}</strong> — into a group, with you as its
                owner. To promote a different account, sign in as that account
                first. The underlying account and its records are kept; nothing
                is deleted.
              </p>
            </header>

            <div className="sx-panel__body">
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
                Create an app password in your account&apos;s settings. It&apos;s
                stored encrypted so the service can act for the group; you can
                revoke it anytime.
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push("/groups/create")}
                  disabled={isImporting}
                >
                  Create a new account instead
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
