"use client";

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

interface TabsContextValue {
  value: string;
  onChange: (next: string) => void;
  /** Stable id shared across tablist + tabs + panels. */
  baseId: string;
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
}

export function Tabs({ value, onChange, children, className = "" }: TabsProps) {
  const baseId = useId();
  // Ordered list of tab values, used to compute prev/next for arrow keys.
  // useRef so registration doesn't trigger re-renders.
  const orderRef = useRef<string[]>([]);
  // Set of disabled tab values, so arrow-key navigation can skip them.
  const disabledRef = useRef<Set<string>>(new Set());
  // Map value → button DOM node, so we can focus it from the context.
  const buttonsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

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
    () => ({ value, onChange, baseId, registerTab, focusTab }),
    [value, onChange, baseId, registerTab, focusTab],
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
  buttonsRef: React.MutableRefObject<Map<string, HTMLButtonElement>>;
  orderRef: React.MutableRefObject<string[]>;
  disabledRef: React.MutableRefObject<Set<string>>;
}

const TabsRegistryContext = createContext<TabsRegistry | null>(null);

export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Required for screen readers — describes the purpose of the tab strip. */
  "aria-label": string;
  children: React.ReactNode;
}

export function TabList({ children, className = "", ...props }: TabListProps) {
  return (
    <div
      role="tablist"
      className={`inline-flex gap-4 border-b border-[var(--border-subtle)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface TabProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "value"> {
  value: string;
  children: React.ReactNode;
  /** When true, the tab is non-interactive: it ignores clicks, is skipped by
   *  arrow-key / Home / End navigation, is removed from the roving tab order,
   *  and is announced via `aria-disabled`. */
  disabled?: boolean;
  /** Optional count/badge rendered after the label via the Badge primitive
   *  (the neutral `count` chip). Accepts a number or short string. */
  count?: number | string;
}

export function Tab({
  value,
  children,
  disabled = false,
  count,
  className = "",
  ...props
}: TabProps) {
  const ctx = useTabsContext("Tab");
  const registry = useContext(TabsRegistryContext);
  const isActive = ctx.value === value;
  const tabId = `${ctx.baseId}-tab-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;
  const hasCount = count !== undefined && count !== null && count !== "";

  // Register the tab + its disabled state on every render. This is cheap
  // (Set/Map ops + array.includes) and avoids effect-ordering subtleties.
  ctx.registerTab(value, disabled);

  const handleRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (!registry) return;
      if (node) registry.buttonsRef.current.set(value, node);
      else registry.buttonsRef.current.delete(value);
    },
    [registry, value],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
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

  return (
    <button
      ref={handleRef}
      type="button"
      role="tab"
      id={tabId}
      aria-controls={panelId}
      aria-selected={isActive}
      aria-disabled={disabled || undefined}
      // Disabled tabs stay out of the roving tab order entirely; the active
      // (and only the active) enabled tab is the single Tab-key stop.
      tabIndex={disabled ? -1 : isActive ? 0 : -1}
      onClick={() => {
        if (disabled) return;
        ctx.onChange(value);
      }}
      onKeyDown={handleKeyDown}
      className={`inline-flex items-center gap-2 px-1 py-3 text-sm border-b-2 transition-colors duration-150 motion-reduce:transition-none ${
        disabled
          ? "text-[var(--fg-muted)] border-transparent opacity-50 cursor-not-allowed"
          : isActive
            ? "text-[var(--fg-primary)] border-[var(--fg-primary)] font-semibold cursor-pointer"
            : "text-[var(--fg-muted)] border-transparent hover:text-[var(--fg-primary)] cursor-pointer"
      } ${className}`}
      {...props}
    >
      {children}
      {hasCount && (
        <Badge variant="count" compact>
          {count}
        </Badge>
      )}
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
