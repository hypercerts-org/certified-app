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

export function PopoverContent({
  align = "start",
  offset = 4,
  minWidth = 200,
  className = "",
  style,
  children,
  ...props
}: PopoverContentProps) {
  const ctx = usePopover("PopoverContent");
  if (!ctx.open) return null;

  return (
    <div
      ref={ctx.contentRef}
      id={ctx.contentId}
      role="menu"
      className={`absolute top-full z-[40] mt-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded shadow-md p-1 ${alignClass[align]} ${className}`}
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
  ...props
}: PopoverItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`w-full text-left px-3 py-2 text-sm text-[var(--fg-primary)] rounded hover:bg-[var(--overlay-weak)] focus:bg-[var(--overlay-weak)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Popover;
