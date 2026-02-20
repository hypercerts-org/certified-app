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
        const result = await client.init()

        if (cancelled) return

        if (result?.session) {
          // Session is now persisted in IndexedDB.
          // Use full page navigation to ensure AuthProvider reads fresh state.
          window.location.replace("/")
        } else {
          // No session returned — the URL may not have had a valid code fragment.
          // This can happen if the user navigates to /oauth/callback directly.
          setError("No session received. Please try signing in again.")
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-error text-body mb-4">{error}</p>
          <a href="/" className="text-accent hover:underline">
            Return to home
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center">
        {/* Pulsing brandmark as per DESIGN_SYSTEM.md Section 8 */}
        <div className="w-16 h-16 animate-pulse">
          <img
            src="/assets/certified_brandmark.svg"
            alt="Certified"
            className="w-full h-full"
          />
        </div>
        <p className="mt-6 text-body text-gray-400">Completing sign in...</p>
      </div>
    </div>
  )
}
