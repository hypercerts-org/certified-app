export interface AuthState {
  /** Whether the auth system has finished initializing (checking for existing session) */
  isLoading: boolean;
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;
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
  /**
   * Primary sign-in entry point. Triggers a default OAuth redirect to the Certified PDS
   * with no login_hint — if the user already has an active session at the PDS (e.g.
   * because they signed in via another partner app), they're returned immediately
   * without seeing any credential UI. Falls back to the PDS's own login screen otherwise.
   */
  openSignIn: () => Promise<void>;
  /** Open the modal explicitly — for users who want to sign in with a different
   * account, an external ATProto handle, or via email rather than relying on an
   * existing PDS session. */
  openSignInModal: () => void;
  /** Close the modal */
  closeModal: () => void;
  /** Submit Certified email — calls /api/auth/login with mode "email" */
  submitEmail: (email: string) => Promise<void>;
  /** Submit ATProto handle — calls /api/auth/login with mode "handle" */
  submitHandle: (handle: string) => Promise<void>;
  /** Sign out — calls /api/auth/logout and clears local state */
  signOut: () => Promise<void>;
}
