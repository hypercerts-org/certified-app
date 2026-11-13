"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";

/** Structural icon type: lucide icons and wrappers like `CertIcon`. */
export type SideNavIcon = React.ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface SideNavItem {
  /** Stable React key. */
  key: string;
  label: string;
  /** Renders a link. Use it whenever the section has a URL (`?kind=`). */
  href?: string;
  /** Renders a button instead, for sections without a URL. */
  onClick?: () => void;
  icon?: SideNavIcon;
  /** Right-aligned count. `null` / omitted shows nothing; pass "…" while loading. */
  count?: number | string | null;
  current?: boolean;
  /** `data-tour` anchor for the product tour. */
  tour?: string;
}

export interface SideNavProps {
  /** Names the list for assistive tech, e.g. "Kinds of records". */
  "aria-label": string;
  items: SideNavItem[];
  /**
   * From 1100px, stick below the desktop top bar while the page scrolls
   * (default). Turn it off when the nav is not in a sidebar column.
   */
  sticky?: boolean;
  /**
   * Below 1100px: "auto" (default) wraps up to `SIDE_NAV_WRAP_MAX` items
   * and scrolls longer lists; "scroll" always keeps one scrolling row, for
   * a nav that sits above every page of an area (the Workspace), where
   * several wrapped rows would push each page down.
   */
  overflow?: "auto" | "scroll";
  /**
   * "auto" (default): a row of pills below 1100px, a vertical list in a
   * sidebar column from 1100px. "horizontal": the row of pills at every
   * width, for section tabs above a page that has columns of its own (the
   * Network: Feed, Explore, Graph, Map).
   */
  orientation?: "auto" | "horizontal";
  className?: string;
}

/** The pill-row classes alone: drops the `lg:` column overrides. */
function rowOnly(cls: string): string {
  return cls
    .split(" ")
    .filter((c) => !c.startsWith("lg:"))
    .join(" ");
}

/**
 * Below 1100px, up to this many items wrap onto more lines, so every
 * section is in view; a longer list scrolls sideways instead (and keeps
 * the current item in view).
 */
export const SIDE_NAV_WRAP_MAX = 6;

// Below 1100px a row of pills: wrapping (short lists) or a horizontally
// scrolling row (long lists). The 4px row padding keeps focus rings inside
// the scroll box; the scrollbar is hidden (the row still scrolls by touch,
// wheel and keyboard focus). From 1100px: a vertical list of 40px rows.
const listBase =
  "m-0 flex list-none gap-2 p-1 lg:flex-col lg:flex-nowrap lg:gap-0.5 lg:overflow-visible lg:p-0";
const listWrap = "flex-wrap";
const listScroll =
  "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const itemBase =
  "inline-flex min-h-control-md items-center gap-2 whitespace-nowrap rounded-[999px] border px-3.5 py-2 text-left text-ui font-medium no-underline transition-[background-color,border-color,color] duration-fast motion-reduce:transition-none select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 lg:flex lg:w-full lg:min-h-10 lg:rounded lg:border-0 lg:px-3";

// Current: `--bg-selected`, primary text, weight 600 — a filled pill in the
// row, a filled row in the column, like the top bar's current destination.
// `--bg-selected` is grey in light mode and a step lighter than the resting
// pill in dark mode, so the current item never reads as a hole. Black fill
// is kept for the page's one primary action.
const itemCurrent =
  "border-[var(--border-hover)] bg-[var(--bg-selected)] font-semibold text-[var(--fg-primary)]";

// Rest: an outlined pill in the row; a bare row in the column. `hover:`
// only fires on hover-capable devices (tailwind hoverOnlyWhenSupported).
const itemRest =
  "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--fg-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--fg-primary)] lg:bg-transparent lg:hover:bg-[var(--overlay-weak)]";

/**
 * Navigation between the sections of one page (DESIGN.md §9.13): Records
 * kinds, Settings sections, Help contents, Explore lists. Below 1100px it is
 * a row of pills above the content: up to `SIDE_NAV_WRAP_MAX` items wrap
 * onto more lines (nothing hidden off-screen); more scroll sideways, with
 * the current item scrolled into view. From 1100px a vertical list in a
 * sidebar column. Items are links (`href`) or buttons (`onClick`); the
 * current one carries `aria-current` ("page" on links, "true" on buttons).
 */
export default function SideNav({
  "aria-label": ariaLabel,
  items,
  sticky = true,
  overflow = "auto",
  orientation = "auto",
  className = "",
}: SideNavProps) {
  const row = orientation === "horizontal";
  const listCls = row ? rowOnly(listBase) : listBase;
  const baseCls = row ? rowOnly(itemBase) : itemBase;
  const restCls = row ? rowOnly(itemRest) : itemRest;
  const listRef = useRef<HTMLUListElement>(null);
  const scrolls = overflow === "scroll" || items.length > SIDE_NAV_WRAP_MAX;
  const currentKey = items.find((item) => item.current)?.key ?? null;
  const hasScrolledRef = useRef(false);

  // A scrolling row keeps the current item in view: on mount and whenever
  // the current item changes. Sets the row's own scrollLeft (not
  // scrollIntoView, which would also scroll the page). A no-op in the
  // column layout, where the list doesn't overflow.
  useEffect(() => {
    const list = listRef.current;
    if (!scrolls || !list || currentKey === null) return;
    if (list.scrollWidth <= list.clientWidth) return;
    const current = list.querySelector<HTMLElement>("[aria-current]");
    if (!current) return;
    const left =
      current.getBoundingClientRect().left -
      list.getBoundingClientRect().left +
      list.scrollLeft -
      16;
    const smooth =
      hasScrolledRef.current &&
      typeof window.matchMedia === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    hasScrolledRef.current = true;
    if (typeof list.scrollTo === "function") {
      list.scrollTo({ left: Math.max(0, left), behavior: smooth ? "smooth" : "auto" });
    } else {
      list.scrollLeft = Math.max(0, left);
    }
  }, [scrolls, currentKey]);

  // The desktop top bar scrolls away, so the column sticks 32px below the
  // fixed chrome (none on desktop) rather than below the bar's height.
  const navCls = [
    sticky && !row ? "lg:sticky lg:top-[calc(var(--chrome-top,0px)_+_32px)]" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <nav aria-label={ariaLabel} className={navCls || undefined}>
      <ul ref={listRef} className={`${listCls} ${scrolls ? listScroll : listWrap}`}>
        {items.map((item) => {
          const { key, label, href, onClick, icon: Icon, count, current = false, tour } = item;
          const cls = `${baseCls} ${current ? itemCurrent : restCls}`;
          const showCount = count !== null && count !== undefined && count !== "";
          const content = (
            <>
              {Icon ? <Icon size={16} strokeWidth={1.75} aria-hidden /> : null}
              <span>{label}</span>
              {showCount ? (
                <span
                  className={`tabular-nums lg:ml-auto ${
                    current ? "text-inherit" : "text-[var(--fg-muted)]"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </>
          );
          return (
            <li key={key}>
              {href !== undefined ? (
                <Link
                  href={href}
                  onClick={onClick}
                  className={cls}
                  aria-current={current ? "page" : undefined}
                  data-tour={tour}
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onClick}
                  className={`${cls} cursor-pointer`}
                  aria-current={current ? "true" : undefined}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
