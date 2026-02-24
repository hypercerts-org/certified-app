"use client"

import { useEffect, useState } from "react"
import { getOAuthClient } from "@/lib/auth/oauth-client"

export default function OAuthCallbackPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function handleCallback() {
      try {
        const client = getOAuthClient()
        const isInIframe = window.parent !== window

        if (isInIframe) {
          const params = client.readCallbackParams()
          if (!params) {
            setError("No OAuth parameters found.")
            return
          }
          const redirectUri = client.findRedirectUrl()
          const result = await client.initCallback(params, redirectUri)

          if (cancelled) return

          window.parent.postMessage(
            { type: "oauth-callback-complete", sub: result.session.sub },
            window.location.origin
          )
        } else {
          const result = await client.init()
          if (cancelled) return
          if (result?.session) {
            window.location.replace("/")
          } else {
            setError("No session received. Please try signing in again.")
          }
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
          <a href="/" className="text-sm text-accent font-mono hover:text-deep transition-colors duration-150">
            Return to home
          </a>
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
