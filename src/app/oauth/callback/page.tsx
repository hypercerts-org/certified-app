"use client"

import { useEffect, useState } from "react"
import Brandmark from "@/components/ui/brandmark"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import { resolvePostSigninPath } from "@/lib/auth/post-signin"
import { markTourPending } from "@/lib/tour/tour-sentinel"

type Failure = "cancelled" | "other"

export default function OAuthCallbackPage() {
  // The server's error string is technical (and logged below); the page
  // shows a plain explanation plus a way back home, since every failure here
  // is recovered by signing in again (#154). The one case worth naming is
  // a cancel: the authorization server returns `error=access_denied` when
  // the user cancels (for example at Google's account chooser) or denies
  // access, and "your session may have timed out" would be wrong there.
  const [failure, setFailure] = useState<Failure | null>(null)

  useEffect(() => {
    let cancelled = false

    async function handleCallback() {
      try {
        // Forward all query params to the server-side callback handler
        const callbackUrl = `/api/auth/callback-handler${window.location.search}`
        const res = await fetch(callbackUrl)

        if (!res.ok) {
          const data = await res
            .json()
            .catch(() => ({ error: "Callback failed" }))
          throw new Error(data.error || "Authentication failed")
        }

        const { did, isNewCertifiedUser } = await res.json()
        if (cancelled) return

        // First time on certified.app (the server just seeded the Certified
        // profile) — queue the walk-through. The tour provider auto-starts it
        // once the app loads authenticated, i.e. after this redirect, so it
        // runs after the profile records exist.
        if (isNewCertifiedUser && did) markTourPending(did)

        const isInIframe = window.parent !== window

        if (isInIframe) {
          window.parent.postMessage(
            { type: "oauth-callback-complete", sub: did },
            window.location.origin
          )
        } else {
          // Restore the page the user was on before sign-in. Any
          // `/profile/<old-handle>` segment in the saved path is
          // rewritten to the new identity's DID so URLs that were
          // identity-scoped (e.g. ?tab=settings) resolve to the new
          // viewer's equivalent rather than rendering blank panels.
          // Falls back to `/` when no path was stashed.
          window.location.replace(resolvePostSigninPath(did ?? null))
        }
      } catch (err) {
        if (cancelled) return
        console.error("OAuth callback error:", err)
        const error = new URLSearchParams(window.location.search).get("error")
        setFailure(error === "access_denied" ? "cancelled" : "other")
      }
    }

    handleCallback()
    return () => { cancelled = true }
  }, [])

  if (failure) {
    // Same shape as the 404 and error-boundary pages: the EmptyState
    // primitive (h1, muted description) with one small secondary action.
    // "/" lands a signed-out visitor on /welcome, where they can sign in.
    return (
      <EmptyState
        title={failure === "cancelled" ? "Sign-in cancelled" : "Sign-in didn’t finish"}
        description={
          failure === "cancelled"
            ? "You can sign in again any time."
            : "Your session may have timed out. Please sign in again."
        }
        headingLevel={1}
        className="pt-[120px]"
      >
        <Button variant="secondary" size="sm" href="/">
          Go back home
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="loading-screen">
      <div className="loading-screen__inner">
        <Brandmark title="Certified" className="loading-screen__logo" />
      </div>
    </div>
  )
}
