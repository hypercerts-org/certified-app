"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getOAuthClient } from "@/lib/auth/oauth-client"

export default function OAuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      try {
        const client = getOAuthClient()
        await client.init()
        // Redirect to home page after successful callback processing
        router.push("/")
      } catch (err) {
        console.error("OAuth callback error:", err)
        setError(err instanceof Error ? err.message : "Authentication failed")
      }
    }

    handleCallback()
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-error text-body mb-4">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="text-accent hover:underline"
          >
            Return to home
          </button>
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
