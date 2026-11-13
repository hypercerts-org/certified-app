"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { KeyRound, Users } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { usePageTitle } from "@/lib/navbar-context"
import { importGroup, RegisterGroupError } from "@/lib/groups/api"
import { authFetch } from "@/lib/auth/fetch"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import FormActionBar from "@/components/create/form-action-bar"

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

  // The page's one header (DESIGN.md §9.13), shared by every state below.
  const pageHeader = (
    <PageHeader
      back={{ href: "/home", label: "Home" }}
      title="Turn an account into a group"
      description="Keep the account and its records, and manage it as a group."
    />
  )

  if (authLoading) {
    return (
      <PageContainer width="narrow">
        {pageHeader}
        <div className="flex justify-center py-16">
          <LoadingSpinner size="md" />
        </div>
      </PageContainer>
    )
  }

  if (!did) {
    return (
      <PageContainer width="narrow">
        {pageHeader}
        <EmptyState
          icon={Users}
          title="Sign in to turn an account into a group"
          description="Sign in as the account you want to turn into a group."
          headingLevel={2}
        >
          <Button variant="primary" onClick={() => openSignIn()}>
            Sign in
          </Button>
        </EmptyState>
      </PageContainer>
    )
  }

  const accountLabel = handle ? `@${handle}` : did

  return (
    <PageContainer width="narrow">
      {pageHeader}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <p className="m-0 max-w-measure text-body text-[var(--fg-secondary)] text-pretty">
          This converts the account you&apos;re signed in as,{" "}
          <strong className="font-semibold text-[var(--fg-primary)]">{accountLabel}</strong>,
          into a group with you as its owner. To convert a different account,
          sign in as that account first. Nothing is deleted.{" "}
          <Link
            href="/groups/create"
            className="text-[var(--fg-primary)] underline underline-offset-2"
          >
            Create a new group account instead
          </Link>
          .
        </p>

        <div className="flex flex-col gap-1.5">
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
          <p className="m-0 text-caption text-[var(--fg-muted)]">
            Create an app password in your account&apos;s settings. It&apos;s
            stored encrypted so the service can act for the group; you can
            revoke it anytime.
          </p>
        </div>

        {/* No "Publishing as" line: the account being converted is named
            above. */}
        <FormActionBar
          submitLabel="Import as group"
          submittingLabel="Importing…"
          isSubmitting={isImporting}
          submitDisabled={!appPassword.trim()}
          error={error}
          identityLabel={null}
          onCancel={() => router.push("/home")}
        />
      </form>
    </PageContainer>
  )
}
