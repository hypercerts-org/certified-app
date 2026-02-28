"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

export default function OAuthCallbackPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function handleCallback() {
      try {
        // Forward all query params to the server-side callback handler
        const callbackUrl = `/api/auth/callback-handler${window.location.search}`
        const res = await fetch(callbackUrl)

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Callback failed" }))
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
          window.location.replace("/")
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
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-off-white)]">
        <div className="text-center">
          <p className="text-sm text-error mb-4 font-mono">{error}</p>
          <Link href="/" className="text-sm text-accent font-mono hover:text-deep transition-colors duration-150">
            Return to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="loading-screen">
      <div className="loading-screen__inner">
        <img
          src="/assets/certified_brandmark.svg"
          alt="Certified"
          className="loading-screen__logo"
        />
        <p className="mt-6 text-sm text-white/40 font-mono">Completing sign in...</p>
      </div>
    </div>
  )
}
