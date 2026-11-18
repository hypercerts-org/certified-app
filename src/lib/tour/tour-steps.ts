/**
 * The product walk-through script — a single source of truth for both
 * the auto-triggered (post-onboarding) and manually-restarted (/help)
 * runs.
 *
 * Unlike a static spotlight, this tour *navigates*: each step can carry a
 * `navigateTo` route. When a step activates, the renderer routes there (if
 * the step's anchor isn't already on the page), waits for the target
 * element to mount, scrolls it into view, and spotlights it. Steps with
 * `anchor: null` show a centered card. A step whose anchor never appears
 * falls back to a centered card after a bounded wait (product-tour.tsx,
 * MAX_RESOLVE_FRAMES), so no step can hang.
 *
 * The tour is short (nine steps) and stays on the main pages: the account
 * control (who you act as), then each destination's nav item (the `nav-*`
 * anchors live on both the desktop sidebar and the phone pill — the
 * renderer picks whichever is visible): Workspace, Network and its Feed,
 * Apps; then where you create (Workspace › Projects and activities, without
 * opening the form), Settings, and Help to finish. Sidebar anchors ask for
 * "right"; on a phone, where there is no room beside them, the card goes
 * above or below.
 *
 * Anchors are matched against `data-tour="<anchor>"` attributes placed on
 * page content. The same anchor id may appear on more than one element
 * (e.g. a nav item in both the desktop sidebar and the phone pill) —
 * the renderer picks the first *rendered* one, so the visible variant wins
 * per layout. The anchors these steps use:
 *   account-menu — the account control (top of the sidebar; the right
 *     end of the phone top bar)
 *   nav-workspace, nav-network, nav-apps — destinations (the sidebar's
 *     groups from 1300px, its rail items below that, the pill on phones)
 *   feed — the Feed column (home-feed.tsx)
 *   records-new — "New activity" in Workspace › Projects and activities
 *   settings-handle — the handle row in Settings › Account (personal
 *     settings only, so that step is skipped while acting as a group)
 * Other `data-tour` anchors (home-account, navbar-search, explore-category,
 * graph, apps-grid, create-title/-submit, profile-tabs/-edit,
 * settings-bsky-sync) stay in the components for a longer tour.
 *
 * The walk-through paragraph on /help lists these steps; keep them in sync.
 */

export interface TourStep {
  /** Stable id (React key). */
  readonly id: string
  /** Route to visit when this step activates, or null to stay put. */
  readonly navigateTo: string | null
  /** `data-tour` value to spotlight, or null for a centered card. */
  readonly anchor: string | null
  readonly title: string
  readonly body: string
  /** Preferred side the card opens toward when anchored. Default "bottom".
   *  "left"/"right" place the card beside the target (flipping if there's
   *  no room); "top"/"bottom" place it above/below. */
  readonly placement?: "top" | "bottom" | "left" | "right"
  /** Horizontal alignment of the card relative to the target. "center"
   *  (default) centers on it; "start"/"end" align the card's left/right
   *  edge to the target's — use "end" to keep the card off a left-aligned
   *  heading inside a wide target (e.g. the feed's "For you" title). */
  readonly align?: "start" | "center" | "end"
  /** Pin the card to a fixed viewport corner instead of positioning it
   *  next to the target. The spotlight still highlights the anchor; only
   *  the card is detached. Overrides `placement`/`align`. */
  readonly pin?: "top-left" | "top-right" | "bottom-left" | "bottom-right"
  /** Restrict this step to one layout, for anchors that only exist at one
   *  width (the desktop search field). Undefined = shown on both. */
  readonly platform?: "desktop" | "mobile"
  /** Only while acting as yourself: the step's page belongs to your
   *  personal account (/settings is always yours), so while acting as a
   *  group it would show the wrong account, and it's skipped. */
  readonly personalOnly?: boolean
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    navigateTo: "/home",
    anchor: null,
    title: "Welcome to Certified",
    body: "The Certified network is where you record and recognize real work and impact. This app is one view into this open network — other apps share the same data, so your work is never locked in.\n\nHere's a short look around.",
  },

  // ---- Who you act as -------------------------------------------------
  {
    id: "account-menu",
    navigateTo: "/home",
    anchor: "account-menu",
    title: "Who you act as",
    body: "This is the account you're using. If you belong to a group, open it to act as the group: what you create, follow and endorse then comes from the group. Your profile, Settings and signing out are here too.",
    placement: "right",
  },

  // ---- Workspace -----------------------------------------------------
  {
    id: "nav-workspace",
    navigateTo: "/home",
    anchor: "nav-workspace",
    title: "Workspace",
    body: "Your Workspace is everything your account holds: your records, endorsements and groups.",
    placement: "right",
  },

  // ---- Network -------------------------------------------------------
  {
    id: "nav-network",
    navigateTo: "/feed",
    anchor: "nav-network",
    title: "Network",
    body: "Network is everyone's work on Certified, five ways: Feed, Explore, Graph, Map and Funding.",
    placement: "right",
  },
  {
    id: "feed",
    navigateTo: "/feed",
    anchor: "feed",
    title: "Feed",
    body: "Feed is what's happening: new activities, projects and endorsements from accounts you follow, and from accounts endorsed by the trusted endorsers you pick in the filters.",
    placement: "right",
  },

  // ---- Apps ----------------------------------------------------------
  {
    id: "nav-apps",
    navigateTo: "/apps",
    anchor: "nav-apps",
    title: "Apps",
    body: "Other apps that work with your Certified account. Sign in to any of them with the same account: they read and write the same records, so what you publish here shows up there too.",
    placement: "right",
  },

  // ---- Create --------------------------------------------------------
  {
    id: "nav-create",
    navigateTo: "/records?kind=activities",
    anchor: "records-new",
    title: "Create from your Workspace",
    body: "You publish your own work from your Workspace: new activities and projects here, a new group under Groups.",
    placement: "bottom",
    align: "end",
  },

  // ---- Settings ------------------------------------------------------
  {
    id: "settings-handle",
    navigateTo: "/settings#account",
    anchor: "settings-handle",
    title: "Your ID",
    body: "Settings is where you manage your account. This is your handle, the readable part of your ID. Behind it sits a Permanent ID that never changes, so your work stays yours even if you change your handle.",
    placement: "bottom",
    personalOnly: true,
  },

  // ---- Help ----------------------------------------------------------
  {
    id: "help",
    navigateTo: "/help",
    anchor: null,
    title: "Help is here",
    body: "Help answers common questions and takes your feedback: at the bottom of the sidebar on a computer, in your account menu on a phone, and linked at the bottom of every page. You can replay this walk-through from there any time. Welcome to Certified!",
  },
] as const
