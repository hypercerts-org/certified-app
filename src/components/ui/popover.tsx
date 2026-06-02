"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

/**
 * Canonical popover primitive.
 *
 *   <Popover>
 *     <PopoverTrigger>
 *       <button>…</button>
 *     </PopoverTrigger>
 *     <PopoverContent align="end">
 *       …menu items…
 *     </PopoverContent>
 *   </Popover>
 *
 * Behaviour:
 *  - click-outside closes
 *  - Esc closes (and refocuses the trigger)
 *  - aria-controls / aria-expanded wired between trigger and content
 *  - content positions absolutely relative to the trigger; align
 *    controls horizontal alignment ("start" | "center" | "end").
 *
 * Replaces the four ad-hoc menu implementations:
 *  - account switcher menu (layout.css)
 *  - .feed-filter / .popover__menu (explore.css)
 *  - workspace breadcrumb menu (workspace.css)
 *  - .response-menu__menu (feed.css)
 *
 * Intentionally minimal — no Floating UI / popper. The token-driven
 * card chrome lives in a single utility class so the four call sites
 * all look identical.
 */

interface PopoverContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  contentId: string;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopover(component: string): PopoverContextValue {
  const ctx = useContext(PopoverContext);
  if (!ctx) throw new Error(`<${component}> must be inside <Popover>`);
  return ctx;
}

export interface PopoverProps {
  /** Controlled-open. When omitted, popover manages its own state. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  children: React.ReactNode;
}

export function Popover({ open: controlledOpen, onOpenChange, children }: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const contentId = useId();

  // Click outside / Esc to close.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (contentRef.current?.contains(t)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (triggerRef.current as HTMLElement | null)?.focus();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, setOpen]);

  return (
    <PopoverContext.Provider
      value={{ open, setOpen, triggerRef, contentRef, contentId }}
    >
      {/* Inline wrapper for relative positioning of <PopoverContent>. */}
      <span className="inline-flex relative">{children}</span>
    </PopoverContext.Provider>
  );
}

export interface PopoverTriggerProps {
  /**
   * Single child element that becomes the trigger. The popover wires
   * onClick / aria-expanded / aria-controls onto it via React.cloneElement.
   */
  children: React.ReactElement;
}

export function PopoverTrigger({ children }: PopoverTriggerProps) {
  const ctx = usePopover("PopoverTrigger");
  // Cast: cloneElement loses ref type info; the trigger is assumed to
  // be a focusable element.
  const childProps = children.props as Record<string, unknown>;
  return React.cloneElement(children, {
    ref: ctx.triggerRef,
    "aria-haspopup": "menu",
    "aria-expanded": ctx.open,
    "aria-controls": ctx.contentId,
    onClick: (e: React.MouseEvent) => {
      ctx.setOpen(!ctx.open);
      const existing = childProps["onClick"];
      if (typeof existing === "function") existing(e);
    },
  } as React.HTMLAttributes<HTMLElement>);
}

export type PopoverAlign = "start" | "center" | "end";

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Horizontal alignment relative to the trigger. */
  align?: PopoverAlign;
  /** Pixel offset below the trigger. Defaults to 4 px. */
  offset?: number;
  /** Optional min-width. */
  minWidth?: number | string;
  children: React.ReactNode;
}

const alignClass: Record<PopoverAlign, string> = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

/**
 * Collect the non-disabled menu items inside a content element, in DOM
 * order. Used for roving focus. Disabled items (native `disabled` or
 * `aria-disabled="true"`) are skipped so arrow navigation never lands on
 * an unactionable option.
 */
function getMenuItems(content: HTMLElement | null): HTMLElement[] {
  if (!content) return [];
  return Array.from(
    content.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-disabled") !== "true",
  );
}

export function PopoverContent({
  align = "start",
  offset = 4,
  minWidth = 200,
  className = "",
  style,
  children,
  onKeyDown,
  ...props
}: PopoverContentProps) {
  // Pull ref + id out of the context locally — the React 19 strict-refs
  // lint rule is overly cautious about accessing context-held refs in JSX.
  const { open, contentRef, contentId } = usePopover("PopoverContent");

  // Focus the first menu item when the menu opens, so keyboard users land
  // inside the menu (matching native <select>/menu semantics). Esc-to-close
  // and focus-return-to-trigger live in <Popover>.
  useEffect(() => {
    if (!open) return;
    const items = getMenuItems(contentRef.current);
    items[0]?.focus();
  }, [open, contentRef]);

  if (!open) return null;

  // Arrow-key roving focus among menu items. Home/End jump to the
  // first/last. Disabled items are skipped (see getMenuItems). Escape is
  // intentionally left to <Popover>'s document-level handler so focus
  // returns to the trigger from anywhere in the menu.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = getMenuItems(contentRef.current);
    if (items.length > 0) {
      const current = items.indexOf(
        document.activeElement as HTMLElement,
      );
      let next = -1;
      switch (e.key) {
        case "ArrowDown":
          next = current < 0 ? 0 : (current + 1) % items.length;
          break;
        case "ArrowUp":
          next =
            current < 0
              ? items.length - 1
              : (current - 1 + items.length) % items.length;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = items.length - 1;
          break;
        default:
          break;
      }
      if (next !== -1) {
        e.preventDefault();
        items[next]?.focus();
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div
      ref={contentRef}
      id={contentId}
      role="menu"
      onKeyDown={handleKeyDown}
      className={`absolute top-full z-[var(--z-popover)] mt-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded shadow-md p-1 ${alignClass[align]} ${className}`}
      style={{ minWidth, marginTop: offset, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

export interface PopoverItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export function PopoverItem({
  children,
  className = "",
  tabIndex,
  ...props
}: PopoverItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      // Roving focus: items are removed from the sequential Tab order so a
      // single Tab moves past the whole menu; arrow keys (handled by
      // <PopoverContent>) move focus between items. <PopoverContent>
      // focuses the first item on open. Callers can still override.
      tabIndex={tabIndex ?? -1}
      className={`w-full text-left px-3 py-2 text-sm text-[var(--fg-primary)] rounded hover:bg-[var(--overlay-weak)] focus:bg-[var(--overlay-weak)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Popover;
