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
  /** Which mode the modal opened in: sign-in or sign-up */
  authMode: "sign-in" | "sign-up";
  /** Open the modal in sign-in mode */
  openSignIn: () => void;
  /** Open the modal in sign-up mode */
  openSignUp: () => void;
  /** Close the modal */
  closeModal: () => void;
  /** Submit Certified email (Flow 1) — calls /api/auth/login with mode "email" */
  submitEmail: (email: string) => Promise<void>;
  /** Submit ATProto handle — calls /api/auth/login with mode "handle" */
  submitHandle: (handle: string) => Promise<void>;
  /** Sign out — calls /api/auth/logout and clears local state */
  signOut: () => Promise<void>;
}
