"use client";

import { Check } from "lucide-react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/hooks/use-mounted";

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
 *  - arrow-key roving focus over the menu's items.
 *
 * Item roles: <PopoverItem> is a plain action item (role="menuitem") by
 * default. Pass `selected` (boolean) to turn it into a single-select
 * option — role="menuitemradio" + aria-checked, with a leading checkmark
 * on the selected row — which is what a "Sort:" or other "pick exactly
 * one" menu needs. Both roles participate in arrow-key roving.
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
 *
 * Portal mode (opt-in, `<PopoverContent portal>`):
 *  - Renders the SAME `<div role="menu">` (same class string, same ref,
 *    same keyboard handling) through `createPortal(node, document.body)`
 *    with `position: fixed`, so it escapes ancestor `overflow`/`transform`
 *    clipping contexts (e.g. a scrollable rail or a sticky top bar). This
 *    is what the account-switcher / create menus in the layout chrome need.
 *  - Position is computed from the trigger's `getBoundingClientRect()` for
 *    the chosen `side` ('top' | 'bottom') and `align` (reused as the
 *    horizontal edge: 'start' | 'center' | 'end'), then FLIP/clamped to
 *    stay within the viewport by `collisionPadding`. It re-measures on
 *    scroll/resize (passive, capture, cleaned up).
 *  - `matchTriggerWidth` sets the menu width to the trigger's width.
 *  - The portaled node still wires `contentRef`, so the existing two-ref
 *    (`triggerRef` + `contentRef`) click-outside in <Popover> keeps working
 *    across the portal boundary, and Esc-to-close / focus-return are
 *    unchanged.
 *  - SSR-guarded: the portal only mounts after the client hydrates
 *    (`useMounted`), so the server render stays portal-free.
 *
 * The default (non-portal) path is BYTE-IDENTICAL to the pre-portal
 * primitive — same DOM, same class string, same inline style — so every
 * existing in-flow consumer renders exactly as before.
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

/** Vertical side the portaled menu opens toward (portal mode only). */
export type PopoverSide = "top" | "bottom";

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Horizontal alignment relative to the trigger.
   *
   * In the default (in-flow) path this maps to the absolute-position
   * utility class (`left-0` / centered / `right-0`). In portal mode it is
   * reused as the horizontal *edge* the menu aligns to: 'start' = left
   * edges aligned, 'center' = centered on the trigger, 'end' = right edges
   * aligned.
   */
  align?: PopoverAlign;
  /**
   * Pixel offset below the trigger. Defaults to 4 px. In the in-flow path
   * this becomes the content's `margin-top`. In portal mode it is the
   * default for `sideOffset` (the gap between trigger and menu on the
   * chosen `side`).
   */
  offset?: number;
  /** Optional min-width. */
  minWidth?: number | string;
  /**
   * Opt into a portal + fixed-position + collision layer. Default `false`
   * keeps the original absolute, in-flow rendering BYTE-IDENTICAL. When
   * `true`, the same menu node is portaled to `document.body` with
   * `position: fixed` and positioned against the trigger (see the
   * `side` / `align` / `sideOffset` / `collisionPadding` / `matchTriggerWidth`
   * props below). Use this when an ancestor's `overflow`/`transform` would
   * otherwise clip the menu.
   */
  portal?: boolean;
  /**
   * Portal mode only: which side of the trigger the menu opens toward.
   * Defaults to 'bottom'. The menu FLIPs to the opposite side if there
   * isn't room within the viewport (respecting `collisionPadding`).
   */
  side?: PopoverSide;
  /**
   * Portal mode only: gap in px between the trigger and the menu along
   * `side`. Defaults to `offset` (so a single `offset` controls the gap
   * in both modes).
   */
  sideOffset?: number;
  /**
   * Portal mode only: minimum distance in px the menu keeps from each
   * viewport edge while clamping. Defaults to 8.
   */
  collisionPadding?: number;
  /**
   * Portal mode only: when `true`, the menu's width is pinned to the
   * trigger's measured width (handy for a select-style menu that should
   * line up with its trigger).
   */
  matchTriggerWidth?: boolean;
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
 *
 * Both `role="menuitem"` (action items) and `role="menuitemradio"`
 * (single-select / sort-menu items, see <PopoverItem selected>) are
 * collected, so arrow-key roving works identically whichever role the
 * caller adopts.
 */
function getMenuItems(content: HTMLElement | null): HTMLElement[] {
  if (!content) return [];
  return Array.from(
    content.querySelectorAll<HTMLElement>(
      '[role="menuitem"],[role="menuitemradio"]',
    ),
  ).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-disabled") !== "true",
  );
}

/**
 * Fixed-position coordinates for the portaled menu. `left`/`top` are
 * viewport-relative (px) and feed straight into `position: fixed`.
 * `width` is only set when `matchTriggerWidth` is on.
 */
interface PortalCoords {
  left: number;
  top: number;
  width?: number;
}

/**
 * Compute viewport-relative `position: fixed` coords for the portaled
 * menu, given the trigger rect and the measured menu size, then
 * FLIP/clamp so the menu stays within the viewport minus `collisionPadding`.
 *
 *  - `side` picks the preferred vertical side; we FLIP to the opposite
 *    side when the preferred side lacks room but the opposite has more.
 *  - `align` is the horizontal edge: 'start' aligns left edges, 'end'
 *    aligns right edges, 'center' centers on the trigger. The result is
 *    then clamped horizontally within the viewport.
 */
function computePortalCoords(
  triggerRect: DOMRect,
  menuW: number,
  menuH: number,
  side: PopoverSide,
  align: PopoverAlign,
  sideOffset: number,
  collisionPadding: number,
): { left: number; top: number } {
  const vw = globalThis.innerWidth;
  const vh = globalThis.innerHeight;

  // --- vertical (side) with FLIP ---
  const spaceBelow = vh - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  let resolvedSide = side;
  if (side === "bottom" && spaceBelow < menuH + sideOffset + collisionPadding && spaceAbove > spaceBelow) {
    resolvedSide = "top";
  } else if (side === "top" && spaceAbove < menuH + sideOffset + collisionPadding && spaceBelow > spaceAbove) {
    resolvedSide = "bottom";
  }
  let top =
    resolvedSide === "bottom"
      ? triggerRect.bottom + sideOffset
      : triggerRect.top - sideOffset - menuH;
  // Clamp vertically within the viewport.
  const maxTop = vh - collisionPadding - menuH;
  const minTop = collisionPadding;
  top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));

  // --- horizontal (align) with clamp ---
  let left: number;
  if (align === "start") {
    left = triggerRect.left;
  } else if (align === "end") {
    left = triggerRect.right - menuW;
  } else {
    left = triggerRect.left + triggerRect.width / 2 - menuW / 2;
  }
  const maxLeft = vw - collisionPadding - menuW;
  const minLeft = collisionPadding;
  left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));

  return { left, top };
}

export function PopoverContent({
  align = "start",
  offset = 4,
  minWidth = 200,
  className = "",
  style,
  children,
  onKeyDown,
  portal = false,
  side = "bottom",
  sideOffset,
  collisionPadding = 8,
  matchTriggerWidth = false,
  ...props
}: PopoverContentProps) {
  // Pull ref + id out of the context locally — the React 19 strict-refs
  // lint rule is overly cautious about accessing context-held refs in JSX.
  const { open, triggerRef, contentRef, contentId } = usePopover("PopoverContent");

  // Portal mode only: SSR-guard (portal can't run on the server) and the
  // computed fixed-position coords. Both hooks run unconditionally so the
  // hook order is stable whether or not `portal` is set.
  const mounted = useMounted();
  const [coords, setCoords] = useState<PortalCoords | null>(null);
  // Effective gap on the chosen side — a single `offset` controls both
  // modes unless the caller passes an explicit `sideOffset`.
  const resolvedSideOffset = sideOffset ?? offset;

  // Focus the first menu item when the menu opens, so keyboard users land
  // inside the menu (matching native <select>/menu semantics). Esc-to-close
  // and focus-return-to-trigger live in <Popover>. In portal mode we focus
  // with { preventScroll: true } so the browser doesn't scroll the page to
  // bring the freshly-portaled (off-flow) node into view — the menu is
  // already positioned next to the trigger.
  useEffect(() => {
    if (!open) return;
    const items = getMenuItems(contentRef.current);
    if (portal) items[0]?.focus({ preventScroll: true });
    else items[0]?.focus();
  }, [open, contentRef, portal]);

  // Portal mode only: measure the trigger + menu and compute fixed coords
  // in a layout effect (before paint, so there's no first-frame flash at
  // 0,0), then keep them in sync on scroll/resize. The listeners are
  // passive + capture (scroll events from nested scrollers don't bubble,
  // so capture is required to catch them) and are cleaned up on close.
  // No-op unless we're open, in portal mode, and mounted on the client.
  useLayoutEffect(() => {
    if (!portal || !open || !mounted) return;
    const reposition = () => {
      const trigger = triggerRef.current;
      const menu = contentRef.current;
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const menuW = matchTriggerWidth ? triggerRect.width : menuRect.width;
      const { left, top } = computePortalCoords(
        triggerRect,
        menuW,
        menuRect.height,
        side,
        align,
        resolvedSideOffset,
        collisionPadding,
      );
      setCoords({
        left,
        top,
        width: matchTriggerWidth ? triggerRect.width : undefined,
      });
    };
    reposition();
    globalThis.addEventListener("scroll", reposition, { passive: true, capture: true });
    globalThis.addEventListener("resize", reposition, { passive: true });
    return () => {
      globalThis.removeEventListener("scroll", reposition, { capture: true } as EventListenerOptions);
      globalThis.removeEventListener("resize", reposition);
    };
    // align/side/offset/padding/width are primitives; contentRef/triggerRef
    // are stable refs. Re-run when any positioning input changes.
  }, [
    portal,
    open,
    mounted,
    side,
    align,
    resolvedSideOffset,
    collisionPadding,
    matchTriggerWidth,
    triggerRef,
    contentRef,
  ]);

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

  // --- Portal path (opt-in) ---------------------------------------------
  // Same <div role="menu"> as below, but position: fixed at the computed
  // viewport coords and rendered into document.body via createPortal. The
  // SAME contentRef is wired, so <Popover>'s two-ref click-outside still
  // recognises clicks inside the portaled menu. We mount the node even
  // before the first measurement (coords === null) so the layout effect
  // has something to measure; it's parked off-screen + invisible for that
  // single pre-measure frame to avoid a flash at (0,0).
  if (portal) {
    // SSR / pre-hydration: render nothing into the portal target. The
    // post-mount commit (useMounted -> true) renders the real menu.
    if (!mounted) return null;
    const positioned = coords !== null;
    return createPortal(
      <div
        ref={contentRef}
        id={contentId}
        role="menu"
        onKeyDown={handleKeyDown}
        className={`z-[var(--z-popover)] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded shadow-md p-1 ${className}`}
        style={{
          position: "fixed",
          top: coords?.top ?? 0,
          left: coords?.left ?? 0,
          minWidth,
          width: coords?.width,
          // Park the node off-flow + invisible for the single frame before
          // the layout effect measures it; reveal once positioned.
          visibility: positioned ? undefined : "hidden",
          ...style,
        }}
        {...props}
      >
        {children}
      </div>,
      document.body,
    );
  }

  // --- Default in-flow path (BYTE-IDENTICAL to the pre-portal primitive) -
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
  /**
   * Opt into single-select (radio) semantics. When provided, the item
   * renders `role="menuitemradio"` + `aria-checked={selected}` and shows a
   * leading checkmark in its selected state — the shape a sort menu (or any
   * "pick exactly one" menu) needs. Omit it for plain action items, which
   * keep `role="menuitem"` and no checkmark slot.
   *
   * Arrow-key roving (see getMenuItems in <PopoverContent>) matches both
   * roles, so keyboard navigation is identical either way.
   */
  selected?: boolean;
}

export function PopoverItem({
  children,
  className = "",
  tabIndex,
  selected,
  ...props
}: PopoverItemProps) {
  // `selected` is the opt-in to radio semantics: undefined => plain action
  // item (role="menuitem", no checkmark slot); boolean => single-select item
  // (role="menuitemradio", aria-checked, reserved leading checkmark column).
  const isRadio = selected !== undefined;
  return (
    <button
      type="button"
      role={isRadio ? "menuitemradio" : "menuitem"}
      // Only emit aria-checked for radio items; a plain menuitem must not
      // carry it (the role doesn't support a checked state).
      aria-checked={isRadio ? selected : undefined}
      // Roving focus: items are removed from the sequential Tab order so a
      // single Tab moves past the whole menu; arrow keys (handled by
      // <PopoverContent>) move focus between items. <PopoverContent>
      // focuses the first item on open. Callers can still override.
      tabIndex={tabIndex ?? -1}
      className={`w-full ${isRadio ? "flex items-center gap-2" : "text-left"} px-3 py-2 text-sm text-[var(--fg-primary)] rounded hover:bg-[var(--overlay-weak)] focus:bg-[var(--overlay-weak)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {isRadio && (
        // Reserved leading column so labels stay aligned whether or not the
        // row is the selected one. The checkmark only paints when selected;
        // aria-hidden because aria-checked already conveys state.
        <Check
          className={`h-3.5 w-3.5 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}
          strokeWidth={3}
          aria-hidden="true"
        />
      )}
      {isRadio ? <span className="flex-1 text-left">{children}</span> : children}
    </button>
  );
}

export default Popover;
