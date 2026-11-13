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
 * What pages tell the chrome (the phone `Navbar`, the `DesktopTopBar` and
 * the `AppShell`):
 *   - the page title (`usePageTitle`, optional desktop override and
 *     breadcrumb): the chrome's fallback `<h1>` when the page has no
 *     `<PageHeader>` (DESIGN.md §3.6), and the phone fallback bar's title;
 *   - whether a `<PageHeader>` is mounted (`useRegisterPageHeader`);
 *   - the full-bleed shell flag for the profile (`useProfileNavbar`).
 *
 * The phone bar picks its layout itself: the brandmark on top-level pages
 * and a back chevron everywhere else (PageHeader or not); the compact title
 * only on a titled page without a PageHeader. The hooks below only toggle
 * their own flag so multiple pages can coexist without stepping on each
 * other.
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
 * Config for the record-level overflow menu (Share / Add to list / Copy AT
 * URI) shown in the mobile navbar's right slot on detail pages. Stored
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
  /** Desktop-only fallback-h1 override (the record's name regardless of
   *  the active tab). Falls back to `pageTitle` when unset. */
  desktopTitle: string | null;
  breadcrumb: PageTitleBreadcrumb | null;
  /** Record-level overflow menu, rendered in the phone bar's right slot
   *  when a page publishes one. Record pages now carry their menu beside
   *  the title, so this is on its way out (no page publishes it). */
  recordMenu: PageRecordMenu | null;
  /** The page wants the full-bleed shell (the profile: banner edge to
   *  edge). Read by `AppShell`. Set via `useProfileNavbar`. */
  profileOverlay: boolean;
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
  hasPageHeader: false,
};

const defaultSetters: NavbarSetters = {
  setPageTitle: () => {},
  setDesktopTitle: () => {},
  setBreadcrumb: () => {},
  setRecordMenu: () => {},
  setProfileOverlay: () => {},
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
      registerPageHeader,
    }),
    [
      setPageTitle,
      setDesktopTitle,
      setBreadcrumb,
      setRecordMenu,
      setProfileOverlay,
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
      hasPageHeader,
    }),
    [pageTitle, desktopTitle, breadcrumb, recordMenu, profileOverlay, hasPageHeader]
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
 * Set the title for the current page. The chrome renders it as the page's
 * `<h1>` unless the page renders a `<PageHeader>` (see
 * `useRegisterPageHeader`): on phones as the fallback bar's compact title,
 * on desktop visually hidden. Also used for the document title by some
 * pages' own effects.
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
 *   desktop top bar) renders no h1 of its own, visible or visually hidden,
 *   and the phone bar shows no compact title (it keeps its back chevron on
 *   pages that aren't top-level).
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
 * Set a desktop-only fallback-h1 override. Use alongside `usePageTitle`
 * when the phone title is tab-aware but the desktop h1 should keep the
 * record's name on every tab. Pass `null` to leave it on the
 * `usePageTitle` value. (Only matters on pages without a PageHeader.)
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
 * URI) to the phone bar's right slot. Record pages render a PageHeader, so
 * their menu belongs beside the title in the page at every width.
 *
 * @deprecated Put the record menu in the page; this is kept only until the
 * record pages stop calling it.
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
 * Put the current page in the full-bleed shell (`.app-shell--fullbleed`):
 * no side gutters or reading-column cap, so the profile banner runs edge to
 * edge right below the top bar. (The name is historical: the phone bar used
 * to float transparently over the banner; it is now the normal bar.)
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
