"use client";

import Link, { type LinkProps } from "next/link";
import React, {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
} from "react";

import Badge from "./badge";

/**
 * Canonical Tabs/Tab/TabPanel components with proper ARIA semantics:
 *   role="tablist" on the strip, role="tab" on each trigger,
 *   role="tabpanel" on each panel, aria-controls / aria-labelledby
 *   wired up automatically. Arrow keys navigate between tabs.
 *
 * Replaces the .profile-tabs__tab / .feed-tabs__tab CSS-driven
 * pattern. Visually identical (underline-on-active) but a11y is
 * now handled by the component instead of by each call site.
 *
 * Usage:
 *
 *   <Tabs value={tab} onChange={setTab}>
 *     <TabList aria-label="Profile sections">
 *       <Tab value="overview">Overview</Tab>
 *       <Tab value="activity">Activity</Tab>
 *       <Tab value="endorsements">Endorsements</Tab>
 *     </TabList>
 *     <TabPanel value="overview">…</TabPanel>
 *     <TabPanel value="activity">…</TabPanel>
 *     <TabPanel value="endorsements">…</TabPanel>
 *   </Tabs>
 */

/** Visual treatment of the tab strip. `underline` is the canonical
 *  underline-on-active strip; `segmented` is a sunken pill container with
 *  the active tab as a raised pill. */
export type TabsVariant = "underline" | "segmented";

interface TabsContextValue {
  value: string;
  onChange: (next: string) => void;
  /** Stable id shared across tablist + tabs + panels. */
  baseId: string;
  /** Visual treatment, shared so TabList + Tab style themselves consistently. */
  variant: TabsVariant;
  /** Ordered list of tab values, used by arrow-key navigation. */
  registerTab: (value: string, disabled: boolean) => void;
  focusTab: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside a <Tabs>`);
  }
  return ctx;
}

export interface TabsProps {
  value: string;
  onChange: (next: string) => void;
  children: React.ReactNode;
  /** Optional className on the outer wrapper. */
  className?: string;
  /** Visual treatment of the strip. Defaults to `underline` (the canonical
   *  underline-on-active look). `segmented` renders a sunken pill container
   *  with the active tab as a raised pill. */
  variant?: TabsVariant;
}

export function Tabs({
  value,
  onChange,
  children,
  className = "",
  variant = "underline",
}: TabsProps) {
  const baseId = useId();
  // Ordered list of tab values, used to compute prev/next for arrow keys.
  // useRef so registration doesn't trigger re-renders.
  const orderRef = useRef<string[]>([]);
  // Set of disabled tab values, so arrow-key navigation can skip them.
  const disabledRef = useRef<Set<string>>(new Set());
  // Map value → tab DOM node, so we can focus it from the context. Stores
  // HTMLElement because a tab may render as a <button> or a <Link> (<a>).
  const buttonsRef = useRef<Map<string, HTMLElement>>(new Map());

  const registerTab = useCallback((v: string, disabled: boolean) => {
    if (!orderRef.current.includes(v)) {
      orderRef.current.push(v);
    }
    if (disabled) disabledRef.current.add(v);
    else disabledRef.current.delete(v);
  }, []);

  const focusTab = useCallback((v: string) => {
    buttonsRef.current.get(v)?.focus();
  }, []);

  const ctx = useMemo<TabsContextValue>(
    () => ({ value, onChange, baseId, variant, registerTab, focusTab }),
    [value, onChange, baseId, variant, registerTab, focusTab],
  );

  // Expose buttonsRef + orderRef via a separate context so Tab can register
  // its DOM node without re-rendering siblings on every render.
  return (
    <TabsContext.Provider value={ctx}>
      <TabsRegistryContext.Provider value={{ buttonsRef, orderRef, disabledRef }}>
        <div className={className}>{children}</div>
      </TabsRegistryContext.Provider>
    </TabsContext.Provider>
  );
}

interface TabsRegistry {
  /** value → tab DOM node. HTMLElement, since a tab may be a <button> or <a>. */
  buttonsRef: React.MutableRefObject<Map<string, HTMLElement>>;
  orderRef: React.MutableRefObject<string[]>;
  disabledRef: React.MutableRefObject<Set<string>>;
}

const TabsRegistryContext = createContext<TabsRegistry | null>(null);

// Resolved variant for a given TabList subtree. TabList publishes the value it
// actually rendered with (its own prop, falling back to the Tabs-level
// variant) so its Tab children style themselves identically — the container
// and its tabs can never disagree. Falls back to the Tabs context (then
// "underline") when a Tab is somehow rendered outside a TabList.
const TabListVariantContext = createContext<TabsVariant | null>(null);

export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Required for screen readers — describes the purpose of the tab strip. */
  "aria-label": string;
  children: React.ReactNode;
  /** Override the variant inherited from `<Tabs>`. Defaults to the Tabs value. */
  variant?: TabsVariant;
}

export function TabList({
  children,
  className = "",
  variant,
  ...props
}: TabListProps) {
  const ctx = useTabsContext("TabList");
  // The TabList prop (if any) wins, otherwise inherit the Tabs-level variant.
  const resolved = variant ?? ctx.variant;

  // Underline path is byte-for-byte identical to today.
  const variantClassName =
    resolved === "segmented"
      ? "inline-flex gap-1 p-1 bg-[var(--bg-sunken)] rounded"
      : "inline-flex gap-4 border-b border-[var(--border-subtle)]";

  return (
    <TabListVariantContext.Provider value={resolved}>
      <div role="tablist" className={`${variantClassName} ${className}`} {...props}>
        {children}
      </div>
    </TabListVariantContext.Provider>
  );
}

export interface TabProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "value"
  > {
  value: string;
  children: React.ReactNode;
  /** When true, the tab is non-interactive: it ignores clicks, is skipped by
   *  arrow-key / Home / End navigation, is removed from the roving tab order,
   *  and is announced via `aria-disabled`. */
  disabled?: boolean;
  /** Optional count/badge rendered after the label via the Badge primitive
   *  (the neutral `count` chip). Accepts a number or short string. */
  count?: number | string;
  /** When set, the tab renders as a Next `<Link href>` (an anchor) instead of
   *  a `<button>` — for URL-router tab strips where each tab is a route. The
   *  same role="tab" / aria-selected / aria-controls, roving tabIndex, and
   *  arrow / Home / End keyboard navigation apply. `onChange` still fires on
   *  activation so controlled `value` stays in sync; navigation is left to the
   *  router. Ignored when `disabled`. */
  href?: string;
  /** Next navigation props forwarded to the underlying `<Link>` — only when
   *  the tab renders as a link (`href` set and not `disabled`). Lets a
   *  URL-router tab strip request `replace` + `scroll={false}` (and optionally
   *  `prefetch`) semantics instead of falling back to a button tab that drives
   *  the router from `onChange`. No effect on button tabs. */
  linkProps?: Pick<LinkProps, "scroll" | "replace" | "prefetch">;
}

export function Tab({
  value,
  children,
  disabled = false,
  count,
  href,
  linkProps,
  className = "",
  ...props
}: TabProps) {
  const ctx = useTabsContext("Tab");
  const registry = useContext(TabsRegistryContext);
  // Resolve the variant from the enclosing TabList (which already merged any
  // TabList-level override with the Tabs-level value), falling back to the
  // Tabs context if a Tab is rendered outside a TabList.
  const variant = useContext(TabListVariantContext) ?? ctx.variant;
  const isActive = ctx.value === value;
  const tabId = `${ctx.baseId}-tab-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;
  const hasCount = count !== undefined && count !== null && count !== "";
  // A tab is a link only when an href is supplied AND it is enabled. A
  // disabled link tab falls back to the non-interactive button so it stays
  // out of the tab order and ignores activation, exactly like a disabled tab.
  const isLink = href !== undefined && !disabled;

  // Register the tab + its disabled state on every render. This is cheap
  // (Set/Map ops + array.includes) and avoids effect-ordering subtleties.
  ctx.registerTab(value, disabled);

  // One ref callback for either element type — both are HTMLElement, which is
  // all `focusTab` needs to call `.focus()`.
  const handleRef = useCallback(
    (node: HTMLElement | null) => {
      if (!registry) return;
      if (node) registry.buttonsRef.current.set(value, node);
      else registry.buttonsRef.current.delete(value);
    },
    [registry, value],
  );

  // Shared by both the button and the link paths so arrow / Home / End move
  // focus across tabs regardless of which element each tab rendered as.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!registry) return;
    const order = registry.orderRef.current;
    const disabledSet = registry.disabledRef.current;
    const idx = order.indexOf(value);
    if (idx < 0) return;

    // Step in `dir` from `idx`, skipping disabled tabs, wrapping once.
    // Returns null if every other tab is disabled.
    const step = (dir: 1 | -1): string | null => {
      for (let i = 1; i <= order.length; i++) {
        const candidate = order[(idx + dir * i + order.length * i) % order.length];
        if (!disabledSet.has(candidate)) return candidate;
      }
      return null;
    };
    // Find the first/last enabled tab for Home/End.
    const edge = (from: "start" | "end"): string | null => {
      const seq = from === "start" ? order : [...order].reverse();
      for (const candidate of seq) {
        if (!disabledSet.has(candidate)) return candidate;
      }
      return null;
    };

    let nextValue: string | null = null;
    if (e.key === "ArrowRight") nextValue = step(1);
    else if (e.key === "ArrowLeft") nextValue = step(-1);
    else if (e.key === "Home") nextValue = edge("start");
    else if (e.key === "End") nextValue = edge("end");
    else return;

    e.preventDefault();
    if (nextValue !== null) {
      ctx.onChange(nextValue);
      ctx.focusTab(nextValue);
    }
  };

  // Underline classes are byte-for-byte identical to the pre-segmented Tab so
  // every existing call site renders unchanged.
  const underlineClassName = `inline-flex items-center gap-2 px-1 py-3 text-sm border-b-2 transition-colors duration-150 motion-reduce:transition-none ${
    disabled
      ? "text-[var(--fg-muted)] border-transparent opacity-50 cursor-not-allowed"
      : isActive
        ? "text-[var(--fg-primary)] border-[var(--fg-primary)] font-semibold cursor-pointer"
        : "text-[var(--fg-muted)] border-transparent hover:text-[var(--fg-primary)] cursor-pointer"
  }`;

  // Segmented: the active tab is a raised pill (elevated bg + small shadow),
  // inactive tabs are flat within the sunken container.
  const segmentedClassName = `inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded transition-colors duration-150 motion-reduce:transition-none ${
    disabled
      ? "text-[var(--fg-muted)] opacity-50 cursor-not-allowed"
      : isActive
        ? "text-[var(--fg-primary)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] font-semibold cursor-pointer"
        : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer"
  }`;

  const tabClassName = `${
    variant === "segmented" ? segmentedClassName : underlineClassName
  } ${className}`;

  // Shared ARIA + roving-tabindex contract for both element types. Disabled
  // tabs stay out of the roving tab order entirely; the active (and only the
  // active) enabled tab is the single Tab-key stop.
  const sharedProps = {
    role: "tab" as const,
    id: tabId,
    "aria-controls": panelId,
    "aria-selected": isActive,
    "aria-disabled": disabled || undefined,
    tabIndex: disabled ? -1 : isActive ? 0 : -1,
    onKeyDown: handleKeyDown,
    className: tabClassName,
  };

  const label = (
    <>
      {children}
      {hasCount && (
        <Badge variant="count" compact>
          {count}
        </Badge>
      )}
    </>
  );

  if (isLink) {
    return (
      <Link
        ref={handleRef as React.Ref<HTMLAnchorElement>}
        href={href}
        // Keep the controlled `value` in sync; the router handles navigation.
        onClick={() => ctx.onChange(value)}
        {...linkProps}
        {...sharedProps}
        {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {label}
      </Link>
    );
  }

  return (
    <button
      ref={handleRef as React.Ref<HTMLButtonElement>}
      type="button"
      onClick={() => {
        if (disabled) return;
        ctx.onChange(value);
      }}
      {...sharedProps}
      {...props}
    >
      {label}
    </button>
  );
}

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  /** When true, the panel always renders (and toggles `hidden`) so
   *  child state survives tab switches. Default unmounts. */
  keepMounted?: boolean;
  children: React.ReactNode;
}

export function TabPanel({
  value,
  keepMounted = false,
  children,
  className = "",
  ...props
}: TabPanelProps) {
  const ctx = useTabsContext("TabPanel");
  const isActive = ctx.value === value;
  const tabId = `${ctx.baseId}-tab-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;

  if (!isActive && !keepMounted) return null;

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      hidden={!isActive}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
}

export default Tabs;
