import type { OAuthSession } from "@atproto/oauth-client-browser";
import type { Agent } from "@atproto/api";

export interface AuthState {
  /** Whether the auth system has finished initializing (checking for existing session) */
  isLoading: boolean;
  /** The current authenticated session, or null */
  session: OAuthSession | null;
  /** An Agent instance bound to the current session for making XRPC calls, or null */
  agent: Agent | null;
  /** The DID of the authenticated user, or null */
  did: string | null;
  /** The PDS URL of the authenticated user (their actual server, not necessarily our app PDS) */
  pdsUrl: string | null;
  /** Error from the last auth operation */
  error: string | null;
  /** Whether the sign-in modal is currently open */
  isModalOpen: boolean;
  /** Whether we are waiting for the external provider redirect (overlay shown) */
  isRedirectingToProvider: boolean;
  /** Which mode the modal opened in: sign-in or sign-up */
  authMode: "sign-in" | "sign-up";
  /** Open the modal in sign-in mode */
  openSignIn: () => void;
  /** Open the modal in sign-up mode */
  openSignUp: () => void;
  /** Close the modal */
  closeModal: () => void;
  /** Submit Certified email (Flow 1) — loads OTP page in iframe with login_hint */
  submitEmail: (email: string) => Promise<void>;
  /** Submit ATProto handle — redirects to that provider's OAuth */
  submitHandle: (handle: string) => Promise<void>;
  /** Sign out — revokes tokens and clears session */
  signOut: () => Promise<void>;
}
