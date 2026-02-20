"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from "react"
import { Agent } from "@atproto/api"
import type { OAuthSession } from "@atproto/oauth-client-browser"
import { getOAuthClient } from "./oauth-client"
import type { AuthState } from "./types"
import SignInModal from "@/components/ui/sign-in-modal"

const AuthContext = createContext<AuthState | undefined>(undefined)

const PDS_URL = process.env.NEXT_PUBLIC_PDS_URL || "https://otp.certs.network"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [session, setSession] = useState<OAuthSession | null>(null)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [did, setDid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in")

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const client = getOAuthClient()
        const result = await client.init()
        
        if (result?.session) {
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

  // Listen for postMessage from iframe callback
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== "oauth-callback-complete") return

      const { sub } = event.data
      if (!sub) return

      try {
        const client = getOAuthClient()
        const oauthSession = await client.restore(sub, false)
        const newAgent = new Agent(oauthSession)
        setSession(oauthSession)
        setAgent(newAgent)
        setDid(oauthSession.did)
      } catch (err) {
        console.error("Session restore error:", err)
        setError(err instanceof Error ? err.message : "Failed to complete sign in")
      } finally {
        setIsSigningIn(false)
        setAuthorizeUrl(null)
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const signIn = useCallback(async () => {
    try {
      setError(null)
      const client = getOAuthClient()
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic",
        display: "page",
      })
      setAuthMode("sign-in")
      setAuthorizeUrl(url.href)
      setIsSigningIn(true)
    } catch (err) {
      console.error("Sign in error:", err)
      setError(err instanceof Error ? err.message : "Failed to sign in")
    }
  }, [])

  const signUp = useCallback(async () => {
    try {
      setError(null)
      const client = getOAuthClient()
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic",
        display: "page",
        prompt: "create",
      })
      setAuthMode("sign-up")
      setAuthorizeUrl(url.href)
      setIsSigningIn(true)
    } catch (err) {
      console.error("Sign up error:", err)
      setError(err instanceof Error ? err.message : "Failed to sign up")
    }
  }, [])

  const closeSignIn = useCallback(() => {
    setIsSigningIn(false)
    setAuthorizeUrl(null)
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
    }
  }, [session])

  const value: AuthState = {
    isLoading,
    session,
    agent,
    did,
    error,
    isSigningIn,
    authorizeUrl,
    authMode,
    signIn,
    signUp,
    signOut,
    closeSignIn,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInModal
        isOpen={isSigningIn}
        authorizeUrl={authorizeUrl}
        authMode={authMode}
        onClose={closeSignIn}
      />
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
