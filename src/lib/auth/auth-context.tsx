"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from "react"
import { Agent } from "@atproto/api"
import type { OAuthSession } from "@atproto/oauth-client-browser"
import { getOAuthClient } from "./oauth-client"
import type { AuthState } from "./types"

const AuthContext = createContext<AuthState | undefined>(undefined)

const PDS_URL = process.env.NEXT_PUBLIC_PDS_URL || "https://otp.certs.network"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [session, setSession] = useState<OAuthSession | null>(null)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [did, setDid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const client = getOAuthClient()
        const result = await client.init()
        
        if (result?.session) {
          // Create Agent from session
          const newAgent = new Agent(result.session)
          setSession(result.session)
          setAgent(newAgent)
          setDid(result.session.did)
        }
      } catch (err) {
        console.error("Auth initialization error:", err)
        setError(err instanceof Error ? err.message : "Failed to initialize auth")
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  // Note: Session expiry/revocation is handled by the BrowserOAuthClient internally
  // The client stores sessions in IndexedDB and will automatically refresh tokens
  // If a session is revoked, subsequent API calls will fail and the app should handle that

  const signIn = useCallback(async () => {
    try {
      setError(null)
      const client = getOAuthClient()
      // Pass PDS URL and scope for the OAuth flow
      await client.signIn(PDS_URL, { 
        scope: "atproto transition:generic" 
      })
      // After signIn, the page will redirect to PDS authorize page
      // On callback, init() will pick up the session
    } catch (err) {
      console.error("Sign in error:", err)
      setError(err instanceof Error ? err.message : "Failed to sign in")
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      setError(null)
      if (session) {
        await session.signOut()
      }
      setSession(null)
      setAgent(null)
      setDid(null)
    } catch (err) {
      console.error("Sign out error:", err)
      setError(err instanceof Error ? err.message : "Failed to sign out")
      throw err
    }
  }, [session])

  const value: AuthState = {
    isLoading,
    session,
    agent,
    did,
    error,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
