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
 * The tour follows the main navigation: for each destination it first
 * spotlights the nav item you'd use (the `nav-*` anchors live on both the
 * desktop top bar and the phone bottom tab bar — the renderer picks
 * whichever is visible), routes to that page, then shows what you can do
 * there. The order mirrors the navigation: Home, Feed, Explore, Records,
 * Apps, then the New button and the account menu (profile, settings,
 * help). The top-bar search step comes on Feed,
 * because the top bar hides its search on /explore (Explore has its own).
 *
 * Anchors are matched against `data-tour="<anchor>"` attributes placed on
 * page content. The same anchor id may appear on more than one element
 * (e.g. a nav item in both the desktop top bar and the phone tab bar) —
 * the renderer picks the first *rendered* one, so the visible variant wins
 * per layout. Every anchor here exists in the current app:
 *   nav-workspace, nav-network, nav-apps — destinations (nav-network is
 *     the Network menu button on desktop and the Network tab on phones)
 *   graph — the endorsement graph on /graph (graph-page.tsx)
 *   nav-create — the New button (desktop) / the + (phone)
 *   account-menu — the account button (desktop and phone)
 *   navbar-search — the desktop search field (not on /explore)
 *   home-account — Home's identity strip (home-account-card.tsx)
 *   feed — the Feed column (home-feed.tsx)
 *   explore-category — Explore's type chips (explore.tsx)
 *   apps-grid — the Apps list (apps/page.tsx)
 *   create-title, create-submit — the New activity form
 *   profile-tabs, profile-edit — the profile's tab strip and Edit button
 *   settings-handle — the handle row in Settings › Account
 *   settings-bsky-sync — Settings › Social graph
 *
 * Copy mirrors the concept sections on /help; keep them in sync.
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
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    navigateTo: "/home",
    anchor: null,
    title: "Welcome to Certified",
    body: "The Certified network is where you record and recognize real work and impact. This app is one view into this open network — other apps share the same data, so your work is never locked in.\n\nLet's take a quick look around.",
  },

  // ---- Workspace -----------------------------------------------------
  {
    id: "nav-workspace",
    navigateTo: "/home",
    anchor: "nav-workspace",
    title: "Workspace",
    body: "Your Workspace is everything your account holds: your records, endorsements and groups, managed from the list on the side. This button shows whose workspace you're in; if you belong to a group, open it to switch to the group's workspace and act as the group. Network, next to it, is everyone else's work.",
    placement: "bottom",
  },
  {
    id: "home-account",
    navigateTo: "/home",
    anchor: "home-account",
    title: "Your account",
    body: "Your profile and your ID. The ID identifies your account in every app. The rest of the page shows your records, the endorsements and follows others have given you, and apps you can use.",
    placement: "right",
  },

  // ---- Network -------------------------------------------------------
  {
    id: "nav-network",
    navigateTo: "/feed",
    anchor: "nav-network",
    title: "Network",
    body: "Network is everyone's work on Certified, five ways: Feed, Explore, Graph, Map and Funding. Open it to pick one.",
    placement: "bottom",
  },

  // ---- Feed ----------------------------------------------------------
  {
    id: "feed",
    navigateTo: "/feed",
    anchor: "feed",
    title: "Feed",
    body: "Feed is what's happening: new activities, projects and endorsements from accounts you follow, and from accounts endorsed by the evaluators you pick in the filters.",
    placement: "right",
  },
  // Before Explore: the top-bar search steps aside on /explore, which has
  // its own search box.
  {
    id: "navbar-search",
    navigateTo: null,
    anchor: "navbar-search",
    title: "Search the network",
    body: "The search bar up here finds any activity, project or account across the whole network, from any page. Press / to jump to it.",
    placement: "bottom",
    platform: "desktop",
  },

  // ---- Explore -------------------------------------------------------
  {
    id: "explore-search",
    navigateTo: "/explore",
    anchor: "explore-category",
    title: "Explore",
    body: "Explore is the whole network: activities, projects and accounts from everyone on Certified. These buttons set what you're looking through; search above them to narrow it down.",
    placement: "bottom",
    align: "start",
  },

  // ---- Graph ---------------------------------------------------------
  {
    id: "graph",
    navigateTo: "/graph",
    anchor: "graph",
    title: "Graph",
    body: "Graph shows who endorses whom across the network. Each dot is an account, each line an endorsement.",
    placement: "top",
  },

  // ---- Apps ----------------------------------------------------------
  {
    id: "nav-apps",
    navigateTo: "/apps",
    anchor: "nav-apps",
    title: "Apps",
    body: "Other apps that work with your Certified account. Sign in to any of them with the same account.",
    placement: "bottom",
  },
  {
    id: "apps-grid",
    navigateTo: "/apps",
    anchor: "apps-grid",
    title: "One account, every app",
    body: "Each app reads and writes the same underlying records, so the work you publish here shows up across all of them — your data isn't locked into any single one.",
    placement: "bottom",
  },

  // ---- Create --------------------------------------------------------
  {
    id: "nav-create",
    navigateTo: null,
    anchor: "nav-create",
    title: "New",
    body: "This button is where you publish your own work: new activities and projects, or a new group.",
    placement: "bottom",
    align: "end",
  },
  {
    id: "create-title",
    navigateTo: "/create",
    anchor: "create-title",
    title: "Give it a title",
    body: "Publishing starts here. Give your activity a clear title — a verifiable claim about the work or impact you want to record.",
    placement: "bottom",
  },
  {
    id: "create-submit",
    navigateTo: "/create",
    anchor: "create-submit",
    title: "Publish when you're ready",
    body: "Fill in the details, then publish. Your activity becomes part of your portable record — visible across every compatible app.",
    placement: "top",
  },

  // ---- Account menu --------------------------------------------------
  {
    id: "account-menu",
    navigateTo: null,
    anchor: "account-menu",
    title: "Your account menu",
    body: "Open this for your public profile, Settings, Help and feedback, or to sign out.",
    placement: "bottom",
    align: "end",
  },

  // ---- Profile -------------------------------------------------------
  {
    id: "profile-tabs",
    navigateTo: "/profile",
    anchor: "profile-tabs",
    title: "Your public profile",
    body: "Your profile is what others see: your activities, projects, endorsements, followers, and lists, in these sections.",
    placement: "bottom",
  },
  {
    id: "profile-edit",
    navigateTo: "/profile",
    anchor: "profile-edit",
    title: "Make it yours",
    body: "Use Edit to set your display name, bio, avatar, and links.",
    placement: "bottom",
  },

  // ---- Settings ------------------------------------------------------
  {
    id: "settings-handle",
    navigateTo: "/settings#account",
    anchor: "settings-handle",
    title: "Your ID",
    body: "Settings is where you manage your account. This is your handle, the readable part of your ID. Behind it sits a Permanent ID that never changes, so your work stays yours even if you change your handle.",
    placement: "bottom",
  },
  {
    id: "settings-sync",
    navigateTo: "/settings#social-graph",
    anchor: "settings-bsky-sync",
    title: "Sync with Bluesky",
    body: "Certified has its own follow graph, kept separate from Bluesky. Sync here any time so you don't have to rebuild your network from scratch.",
    placement: "top",
  },

  // ---- Help ----------------------------------------------------------
  {
    id: "help",
    navigateTo: "/help",
    anchor: null,
    title: "Help",
    body: "Help has guides for everything we just covered. Open it from the account menu or the link at the bottom of every page. You can replay this walk-through from there too.",
  },

  {
    id: "all-set",
    navigateTo: null,
    anchor: null,
    title: "You're all set",
    body: "That's the tour. You can replay it any time from the Help page. Welcome to Certified!",
  },
] as const
