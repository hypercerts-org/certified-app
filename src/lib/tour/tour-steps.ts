/**
 * The product walk-through script — a single source of truth for both
 * the auto-triggered (post-onboarding) and manually-restarted (/help)
 * runs.
 *
 * Unlike a static spotlight, this tour *navigates*: each step can carry a
 * `navigateTo` route. When a step activates, the renderer routes there (if
 * the step's anchor isn't already on the page), waits for the target
 * element to mount, scrolls it into view, and spotlights it. Steps with
 * `anchor: null` show a centered card; steps whose anchor never appears
 * degrade gracefully to a centered card too.
 *
 * The tour is structured around the main navigation: for each destination
 * it first spotlights the nav button you'd click (the `nav-*` anchors live
 * on both the desktop top bar and the mobile bottom nav — the renderer
 * picks whichever is visible), routes to that page, then dives into what
 * you can do there. The order mirrors the nav itself: Home, Explore, Apps,
 * Create, Profile, Settings, Help.
 *
 * Anchors are matched against `data-tour="<anchor>"` attributes placed on
 * page content. The same anchor id may appear on more than one element
 * (e.g. a nav button in both the desktop top bar and the mobile bottom
 * nav) — the renderer picks the first *rendered* one, so the visible
 * variant wins per layout.
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
  /** Restrict this step to one layout. Desktop navigates from the top-bar
   *  buttons; mobile navigates from the hamburger sidebar — so the
   *  per-destination nav spotlights are desktop-only, replaced on mobile by
   *  a single "use the sidebar" step. Undefined = shown on both. */
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

  // ---- Mobile navigation (sidebar) -----------------------------------
  {
    id: "nav-menu",
    navigateTo: "/home",
    anchor: "nav-menu",
    title: "Getting around",
    body: "On mobile you navigate from the menu. Tap it to open the sidebar — Home, Explore, Apps, your Profile, Settings, and Help all live in there.",
    placement: "bottom",
    align: "start",
    platform: "mobile",
  },

  // ---- Home ----------------------------------------------------------
  {
    id: "nav-home",
    navigateTo: "/home",
    anchor: "nav-home",
    title: "Home",
    body: "Home always brings you back to your feed. It's your starting point in the app.",
    placement: "bottom",
    platform: "desktop",
  },
  {
    id: "home-feed",
    navigateTo: "/home",
    anchor: "home-feed",
    title: "Your feed",
    body: "Your feed shows recent activities, projects, and endorsements from the accounts and groups you follow. The more you follow, the richer it gets.",
    placement: "right",
  },

  // ---- Explore -------------------------------------------------------
  {
    id: "nav-explore",
    navigateTo: "/explore",
    anchor: "navbar-search",
    title: "Search the network",
    body: "The search bar up here is always with you. Look up any activity, project, or account from across the whole network — from any page in the app.",
    placement: "bottom",
    platform: "desktop",
  },
  {
    id: "explore-search",
    navigateTo: "/explore",
    anchor: "explore-category",
    title: "Activities, projects, and accounts",
    body: "On Explore, this dropdown sets what you're looking through. Browse all of it at once, or narrow to just activities, projects, or accounts.",
    placement: "bottom",
    align: "start",
  },

  // ---- Apps ----------------------------------------------------------
  {
    id: "nav-apps",
    navigateTo: "/apps",
    anchor: "nav-apps",
    title: "Apps",
    body: "This is where you can see all the apps that are built with Certified on AT Protocol.",
    placement: "bottom",
    platform: "desktop",
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
    navigateTo: "/create",
    anchor: "nav-create",
    title: "Create",
    body: "The + button is where you publish your own work — new activities and projects.",
    placement: "bottom",
    platform: "desktop",
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

  // ---- Profile -------------------------------------------------------
  {
    id: "nav-profile",
    navigateTo: "/profile",
    anchor: "nav-profile",
    title: "Profile",
    body: "Profile is your public page — your work, endorsements, and followers, all in one place.",
    placement: "bottom",
    platform: "desktop",
  },
  {
    id: "profile-tabs",
    navigateTo: "/profile",
    anchor: "profile-tabs",
    title: "Everything in one place",
    body: "Switch between your activities, projects, endorsements, followers, and lists from these sections.",
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

  // ---- Account switcher (groups) --------------------------------------
  {
    id: "account-switcher",
    navigateTo: null,
    anchor: "account-switcher",
    title: "Switch between accounts",
    body: "Your account switcher lives up here. If you belong to a group, switch into it to post and act as the group — then switch back to yourself any time.",
    placement: "bottom",
    align: "end",
    platform: "desktop",
  },

  // ---- Settings ------------------------------------------------------
  {
    id: "nav-settings",
    navigateTo: "/settings",
    anchor: "nav-settings",
    title: "Settings",
    body: "Settings is where you manage your identity and account.",
    placement: "bottom",
    platform: "desktop",
  },
  {
    id: "settings-handle",
    navigateTo: "/settings#account",
    anchor: "settings-handle",
    title: "Your handle and identity",
    body: "This is your handle — your username on the network. Behind it sits a permanent DID that owns your data, so your work stays yours even if you rename your handle.",
    placement: "bottom",
  },
  {
    id: "settings-sync",
    navigateTo: "/settings#social-graph",
    anchor: "settings-bsky-sync",
    title: "Bring your Bluesky follows",
    body: "Certified has its own follow graph, kept separate from Bluesky. Sync here any time so you don't have to rebuild your network from scratch.",
    placement: "top",
  },

  // ---- Help ----------------------------------------------------------
  {
    id: "nav-help",
    navigateTo: "/help",
    anchor: "nav-help",
    title: "Help",
    body: "Help has guides for everything we just covered — and you can replay this walk-through any time from here.",
    placement: "bottom",
    platform: "desktop",
  },

  {
    id: "all-set",
    navigateTo: null,
    anchor: null,
    title: "You're all set",
    body: "That's the tour. You can replay it any time from the Help page. Welcome to Certified!",
  },
] as const
