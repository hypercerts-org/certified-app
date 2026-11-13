"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  ReactNode,
} from "react";

/**
 * Navbar rendering modes:
 *   - "default"         — full app chrome (hamburger + brandmark + account switcher)
 *   - "titled"          — back arrow + centered page title (set via usePageTitle)
 *   - "profile-overlay" — transparent background, back arrow only (set via useProfileNavbar).
 *                         Floats over a full-bleed page (e.g. profile banner). The layout also
 *                         drops its top padding so content starts at viewport top = 0.
 *
 * Mode is derived inside Navbar: pageTitle → "titled"; profileOverlay → "profile-overlay";
 * otherwise "default". The hooks below only toggle the individual flags so multiple pages
 * can coexist without stepping on each other.
 */
export interface PageTitleBreadcrumbPart {
  text: string;
  href: string;
}

export interface PageTitleBreadcrumb {
  left: PageTitleBreadcrumbPart;
  /** When omitted, the navbar renders only `left` as a single clickable
   *  title (no separator, no second segment). */
  right?: PageTitleBreadcrumbPart;
}

/**
 * Config for the record-level overflow menu (Share / Add to list / Copy
 * AT URI) shown in the mobile navbar's right slot on detail pages. Stored
 * as plain primitives (not a ReactNode) so the navbar can construct the
 * `<AddToListMenu>` itself and the publishing hook's effect deps stay
 * stable across renders.
 */
/** Owner-only Edit / Delete actions surfaced inside the navbar record menu.
 *  The activity overview headline routes its inline Edit/Delete here on
 *  mobile so the title row stays clean. Callbacks fire the page's own
 *  handlers (delete-confirm dialog / edit-as-group switch). */
export interface PageRecordEditActions {
  isCreator: boolean;
  editHref: string;
  /** Display label of the group the viewer may edit as, or null. */
  editAsGroupLabel: string | null;
  onEditAsGroup: () => void;
  onDelete: () => void;
}

export interface PageRecordMenu {
  targetUri: string;
  targetCid: string;
  /** A `TypedListType` ("list:certs" | "list:projects" | "list:accounts").
   *  Typed as string here to keep this context free of an atproto import. */
  targetType: string;
  /** Active sub-tab key, so the menu's Share link deep-links to it.
   *  Null/omitted on the overview. */
  shareTab?: string | null;
  /** Owner Edit / Delete actions, when the viewer can edit this record. */
  editActions?: PageRecordEditActions | null;
}

/**
 * The mutable navbar *values*. Every field changes over the app's lifetime.
 * Only the components that actually read chrome (Navbar, DesktopTopBar, and
 * AppShell for `profileOverlay`) subscribe to this context, so a value change
 * doesn't re-render the many pages that merely publish a title via the setter
 * hooks below.
 */
interface NavbarValues {
  pageTitle: string | null;
  /** Desktop-only title override. The mobile navbar shows `pageTitle` (which
   *  detail pages make tab-aware, e.g. "Funding"); the wide desktop top bar,
   *  where the tab strip is already visible, shows this instead so it always
   *  reads the record's name regardless of the active tab. Falls back to
   *  `pageTitle` when unset. */
  desktopTitle: string | null;
  breadcrumb: PageTitleBreadcrumb | null;
  /** Record-level overflow menu rendered in the mobile navbar's right
   *  slot on detail (sub-)pages. Null on pages that don't set it. */
  recordMenu: PageRecordMenu | null;
  profileOverlay: boolean;
  /** True when the viewed profile has a non-empty `longDescription`.
   *  Drives whether the "About" tab is rendered in the top-bar tab
   *  strip. Set by the profile page from its org-marker state and
   *  read by `<DesktopTopBar />` while filtering PROFILE_TABS. */
  profileAboutAvailable: boolean;
  /** True when the viewed profile carries at least one public group
   *  membership OR when the viewer is looking at their own profile.
   *  Drives whether the "Groups" tab renders in the top-bar tab strip. */
  profileGroupsAvailable: boolean;
  /** True while the viewer is inline-editing the profile. The top-bar
   *  (and mobile) tab strips lock to the editable section(s) — Overview,
   *  plus About for orgs — and disable the rest so you can't tab away to
   *  read-only sections mid-edit. Set by the profile page, read by
   *  `<DesktopTopBar />`. */
  profileEditing: boolean;
  /** True while at least one `<PageHeader>` is mounted. The page then owns
   *  its visible `<h1>`, so the chrome must not render its own (visible or
   *  visually hidden) h1. See `useRegisterPageHeader`. */
  hasPageHeader: boolean;
}

/**
 * The navbar *setters*. These come from `useState` so they are referentially
 * stable for the life of the provider; the setters context value is memoized
 * once and never changes identity, so setter-only consumers (the `usePageTitle`
 * family) never re-render when a value changes.
 */
interface NavbarSetters {
  setPageTitle: (title: string | null) => void;
  setDesktopTitle: (title: string | null) => void;
  setBreadcrumb: (b: PageTitleBreadcrumb | null) => void;
  setRecordMenu: (m: PageRecordMenu | null) => void;
  setProfileOverlay: (v: boolean) => void;
  setProfileAboutAvailable: (v: boolean) => void;
  setProfileGroupsAvailable: (v: boolean) => void;
  setProfileEditing: (v: boolean) => void;
  /** Register a mounted `<PageHeader>`. Returns the matching unregister
   *  function. Ref-counted, so nested or remounting headers are safe. */
  registerPageHeader: () => () => void;
}

type NavbarContextValue = NavbarValues & NavbarSetters;

const defaultValues: NavbarValues = {
  pageTitle: null,
  desktopTitle: null,
  breadcrumb: null,
  recordMenu: null,
  profileOverlay: false,
  profileAboutAvailable: false,
  profileGroupsAvailable: false,
  profileEditing: false,
  hasPageHeader: false,
};

const defaultSetters: NavbarSetters = {
  setPageTitle: () => {},
  setDesktopTitle: () => {},
  setBreadcrumb: () => {},
  setRecordMenu: () => {},
  setProfileOverlay: () => {},
  setProfileAboutAvailable: () => {},
  setProfileGroupsAvailable: () => {},
  setProfileEditing: () => {},
  registerPageHeader: () => () => {},
};

const NavbarValuesContext = createContext<NavbarValues>(defaultValues);
const NavbarSettersContext = createContext<NavbarSetters>(defaultSetters);

export function NavbarProvider({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [desktopTitle, setDesktopTitle] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<PageTitleBreadcrumb | null>(null);
  const [recordMenu, setRecordMenu] = useState<PageRecordMenu | null>(null);
  const [profileOverlay, setProfileOverlay] = useState<boolean>(false);
  const [profileAboutAvailable, setProfileAboutAvailable] =
    useState<boolean>(false);
  const [profileGroupsAvailable, setProfileGroupsAvailable] =
    useState<boolean>(false);
  const [profileEditing, setProfileEditing] = useState<boolean>(false);
  // How many <PageHeader>s are mounted. A count rather than a boolean so a
  // header that remounts (StrictMode, a key change, two briefly overlapping
  // during a route transition) never clears the flag for the one that stays.
  const [pageHeaderCount, setPageHeaderCount] = useState(0);
  const registerPageHeader = useCallback(() => {
    setPageHeaderCount((n) => n + 1);
    let registered = true;
    return () => {
      // Guard against a double unregister driving the count below zero.
      if (!registered) return;
      registered = false;
      setPageHeaderCount((n) => Math.max(0, n - 1));
    };
  }, []);
  const hasPageHeader = pageHeaderCount > 0;
  // Setters are stable across renders, so this memo never recomputes and the
  // setters context keeps one identity for the provider's lifetime.
  const setters = useMemo<NavbarSetters>(
    () => ({
      setPageTitle,
      setDesktopTitle,
      setBreadcrumb,
      setRecordMenu,
      setProfileOverlay,
      setProfileAboutAvailable,
      setProfileGroupsAvailable,
      setProfileEditing,
      registerPageHeader,
    }),
    [
      setPageTitle,
      setDesktopTitle,
      setBreadcrumb,
      setRecordMenu,
      setProfileOverlay,
      setProfileAboutAvailable,
      setProfileGroupsAvailable,
      setProfileEditing,
      registerPageHeader,
    ]
  );
  const values = useMemo<NavbarValues>(
    () => ({
      pageTitle,
      desktopTitle,
      breadcrumb,
      recordMenu,
      profileOverlay,
      profileAboutAvailable,
      profileGroupsAvailable,
      profileEditing,
      hasPageHeader,
    }),
    [
      pageTitle,
      desktopTitle,
      breadcrumb,
      recordMenu,
      profileOverlay,
      profileAboutAvailable,
      profileGroupsAvailable,
      profileEditing,
      hasPageHeader,
    ]
  );
  return (
    <NavbarSettersContext.Provider value={setters}>
      <NavbarValuesContext.Provider value={values}>
        {children}
      </NavbarValuesContext.Provider>
    </NavbarSettersContext.Provider>
  );
}

/**
 * Subscribe to the live navbar values. Only the chrome readers (Navbar,
 * DesktopTopBar) should call this — it re-renders on every value change.
 */
export function useNavbarValues() {
  return useContext(NavbarValuesContext);
}

/**
 * Read the full navbar context (values + setters). Kept for consumers that
 * need both; the returned setters are stable and the values are live.
 */
export function useNavbarContext(): NavbarContextValue {
  const values = useContext(NavbarValuesContext);
  const setters = useContext(NavbarSettersContext);
  return { ...values, ...setters };
}

/**
 * Set the navbar title for the current page. While mounted, the navbar
 * switches to a titled layout: a back icon on the left, the title in the
 * center, and an empty right slot. The page itself should not render its
 * own `<h1>` page title since the navbar now carries it, unless the page
 * renders a `<PageHeader>` (see `useRegisterPageHeader`).
 *
 * Usage:
 *   export default function SettingsPage() {
 *     usePageTitle("Settings");
 *     ...
 *   }
 */
export function usePageTitle(title: string) {
  const { setPageTitle } = useContext(NavbarSettersContext);
  useEffect(() => {
    setPageTitle(title);
    return () => setPageTitle(null);
  }, [setPageTitle, title]);
}

/**
 * The chrome h1 contract (DESIGN.md §3.6). Every page has exactly one
 * `<h1>`:
 *
 * - A page that renders `<PageHeader>` owns it: the header's title is the
 *   visible h1. While a PageHeader is mounted, the chrome (mobile navbar,
 *   desktop top bar) must NOT render its own h1, visible or visually hidden.
 *   It may still show the title as plain text (e.g. a compact phone title).
 * - A page without a PageHeader keeps the chrome's h1 (the `usePageTitle`
 *   value) as the fallback.
 *
 * `<PageHeader>` calls this; pages don't. Registers on mount and
 * unregisters on unmount. The registry is ref-counted, so nested,
 * remounting or briefly overlapping headers are fine.
 */
export function useRegisterPageHeader() {
  const { registerPageHeader } = useContext(NavbarSettersContext);
  useEffect(() => registerPageHeader(), [registerPageHeader]);
}

/**
 * True while a `<PageHeader>` is mounted, i.e. the page renders its own
 * visible `<h1>`. Chrome readers check this and skip their own h1 when it
 * is true (see `useRegisterPageHeader`). Subscribes to the live navbar
 * values, so only chrome components should call it.
 */
export function useHasPageHeader(): boolean {
  return useContext(NavbarValuesContext).hasPageHeader;
}

/**
 * Set a desktop-only title override (the wide top bar). Use alongside
 * `usePageTitle` when the mobile title is tab-aware but the desktop bar —
 * which shows the tab strip already — should keep the record's name on every
 * tab. Pass `null` to leave the desktop bar on the `usePageTitle` value.
 */
export function usePageDesktopTitle(title: string | null) {
  const { setDesktopTitle } = useContext(NavbarSettersContext);
  useEffect(() => {
    setDesktopTitle(title);
    return () => setDesktopTitle(null);
  }, [setDesktopTitle, title]);
}

/**
 * Render the navbar title as a two-part breadcrumb — `[left] / [right]` — with
 * both parts as separate links (GitHub `owner / repo` pattern). Pass `null`
 * (e.g. while data is loading) to leave the breadcrumb unset; the caller
 * usually also calls `usePageTitle(...)` to supply a string fallback.
 */
export function usePageTitleBreadcrumb(b: PageTitleBreadcrumb | null) {
  const { setBreadcrumb } = useContext(NavbarSettersContext);
  const key = b
    ? `${b.left.text}|${b.left.href}|${b.right?.text ?? ""}|${b.right?.href ?? ""}`
    : null;
  useEffect(() => {
    setBreadcrumb(b);
    return () => setBreadcrumb(null);
    // `key` captures every observable field of `b`; re-running on `b` itself
    // would fire every render the caller builds a new object literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBreadcrumb, key]);
}

/**
 * Publish the record-level overflow menu (Share / Add to list / Copy AT
 * URI) to the mobile navbar's right slot. Detail pages call this so the
 * menu reads as page-level chrome that acts on the whole record, instead
 * of sitting in the author row where it can be mistaken for an action on
 * the author. Pass `null` while data is loading. No-op visually on
 * desktop (the navbar isn't rendered there — detail pages keep their own
 * in-body menu at ≥800px).
 */
export function usePageRecordMenu(menu: PageRecordMenu | null) {
  const { setRecordMenu } = useContext(NavbarSettersContext);
  // Include the edit-action data (not the callbacks) so the menu re-sets when
  // edit eligibility resolves (e.g. after auth loads), while a new object
  // literal each render still doesn't re-fire (callbacks call stable setters).
  const ea = menu?.editActions;
  const key = menu
    ? `${menu.targetUri}|${menu.targetCid}|${menu.targetType}|${menu.shareTab ?? ""}|${
        ea ? `${ea.isCreator}|${ea.editHref}|${ea.editAsGroupLabel ?? ""}` : ""
      }`
    : null;
  useEffect(() => {
    setRecordMenu(menu);
    return () => setRecordMenu(null);
    // `key` captures every field of `menu`; depending on `menu` itself
    // would re-fire every render the caller builds a new object literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRecordMenu, key]);
}

/**
 * Switch the navbar into "profile overlay" mode for the current page:
 * transparent background, back arrow on the left only, no brandmark, no
 * account switcher. The layout also drops its top padding so the page
 * content starts at viewport top = 0, letting the navbar float directly
 * over the content (e.g. over a profile banner).
 *
 * Usage:
 *   export default function ProfilePage() {
 *     useProfileNavbar();
 *     ...
 *   }
 */
export function useProfileNavbar(enabled: boolean = true) {
  const { setProfileOverlay } = useContext(NavbarSettersContext);
  useEffect(() => {
    if (!enabled) return;
    setProfileOverlay(true);
    return () => setProfileOverlay(false);
  }, [setProfileOverlay, enabled]);
}

/**
 * Publish to the navbar whether the currently viewed profile has a
 * non-empty `longDescription` (rich-text "About" content). The top
 * bar renders the About tab only when this is `true`. Reset to false
 * on unmount so the flag doesn't bleed into the next page.
 */
export function useProfileAboutAvailable(available: boolean) {
  const { setProfileAboutAvailable } = useContext(NavbarSettersContext);
  useEffect(() => {
    setProfileAboutAvailable(available);
    return () => setProfileAboutAvailable(false);
  }, [setProfileAboutAvailable, available]);
}

/**
 * Publish to the navbar whether the currently viewed profile has any
 * group memberships (or is the viewer's own profile). Drives whether
 * the Groups tab renders in the top-bar tab strip.
 */
export function useProfileGroupsAvailable(available: boolean) {
  const { setProfileGroupsAvailable } = useContext(NavbarSettersContext);
  useEffect(() => {
    setProfileGroupsAvailable(available);
    return () => setProfileGroupsAvailable(false);
  }, [setProfileGroupsAvailable, available]);
}

/**
 * Publish to the navbar whether the viewer is currently inline-editing
 * the profile. While set, the top-bar tab strip locks to the editable
 * section(s) so the viewer can't tab away to a read-only section mid-edit.
 * Reset to false on unmount so the lock doesn't bleed into the next page.
 */
export function useProfileEditing(editing: boolean) {
  const { setProfileEditing } = useContext(NavbarSettersContext);
  useEffect(() => {
    setProfileEditing(editing);
    return () => setProfileEditing(false);
  }, [setProfileEditing, editing]);
}
