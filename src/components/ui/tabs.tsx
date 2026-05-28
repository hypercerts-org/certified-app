"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
} from "react";

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
  registerTab: (value: string) => void;
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
  // Map value → button DOM node, so we can focus it from the context.
  const buttonsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  const registerTab = useCallback((v: string) => {
    if (!orderRef.current.includes(v)) {
      orderRef.current.push(v);
    }
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
      <TabsRegistryContext.Provider value={{ buttonsRef, orderRef }}>
        <div className={className}>{children}</div>
      </TabsRegistryContext.Provider>
    </TabsContext.Provider>
  );
}

interface TabsRegistry {
  buttonsRef: React.MutableRefObject<Map<string, HTMLButtonElement>>;
  orderRef: React.MutableRefObject<string[]>;
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
}

export function Tab({ value, children, className = "", ...props }: TabProps) {
  const ctx = useTabsContext("Tab");
  const registry = useContext(TabsRegistryContext);
  const isActive = ctx.value === value;
  const tabId = `${ctx.baseId}-tab-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;

  // Register the tab + DOM node refs on every render. This is cheap
  // (Map.set + array.includes) and avoids effect-ordering subtleties.
  ctx.registerTab(value);

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
    const idx = order.indexOf(value);
    if (idx < 0) return;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % order.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + order.length) % order.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = order.length - 1;
    if (next !== null) {
      e.preventDefault();
      const nextValue = order[next];
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
      tabIndex={isActive ? 0 : -1}
      onClick={() => ctx.onChange(value)}
      onKeyDown={handleKeyDown}
      className={`px-1 py-3 text-sm cursor-pointer border-b-2 transition-colors duration-150 ${
        isActive
          ? "text-[var(--fg-primary)] border-[var(--fg-primary)] font-semibold"
          : "text-[var(--fg-muted)] border-transparent hover:text-[var(--fg-primary)]"
      } ${className}`}
      {...props}
    >
      {children}
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
