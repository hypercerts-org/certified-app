import type { OAuthSession } from "@atproto/oauth-client-browser"
import type { Agent } from "@atproto/api"

export interface AuthState {
  /** Whether the auth system has finished initializing (checking for existing session) */
  isLoading: boolean
  /** The current authenticated session, or null */
  session: OAuthSession | null
  /** An Agent instance bound to the current session for making XRPC calls, or null */
  agent: Agent | null
  /** The DID of the authenticated user, or null */
  did: string | null
  /** Error from the last auth operation */
  error: string | null
  /** Whether the sign-in modal is currently open */
  isSigningIn: boolean
  /** The authorize URL for the iframe, or null */
  authorizeUrl: string | null
  /** Initiate sign-in — opens the PDS authorize page */
  signIn: () => Promise<void>
  /** Initiate sign-up — opens the PDS create-account page */
  signUp: () => Promise<void>
  /** Sign out — revokes tokens and clears session */
  signOut: () => Promise<void>
  /** Close the sign-in modal */
  closeSignIn: () => void
  /** Which auth flow opened the modal */
  authMode: "sign-in" | "sign-up"
}
