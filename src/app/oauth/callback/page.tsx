"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Brandmark from "@/components/ui/brandmark"

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
      <div className="loading-screen">
        <div className="loading-screen__inner">
          <p className="loading-screen__error">{error}</p>
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
