"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Brandmark from "@/components/ui/brandmark"
import { resolvePostSigninPath } from "@/lib/auth/post-signin"

export default function OAuthCallbackPage() {
  const [error, setError] = useState<string | null>(null)
  // True when the failure is a recoverable sign-in interruption (ePDS
  // clean-exit / user-denied / expired flow, #154) rather than a hard
  // error — drives a "try again" affordance instead of a dead end.
  const [canRetry, setCanRetry] = useState(false)

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
          if (!cancelled && data.retry) setCanRetry(true)
          throw new Error(data.error || "Authentication failed")
        }

        const { did } = await res.json()
        if (cancelled) return

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
        setError(err instanceof Error ? err.message : "Authentication failed")
      }
    }

    handleCallback()
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__inner">
          <p className="loading-screen__error">{error}</p>
          {canRetry ? (
            <Link href="/welcome" className="loading-screen__link">
              Try signing in again
            </Link>
          ) : null}
          <Link href="/" className="loading-screen__link">
            Return to home
          </Link>
        </div>
      </div>
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
