"use client";

import React from "react";
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
  className?: string;
}

// Below 1100px: a horizontally scrolling row of pills. The 4px row padding
// keeps focus rings inside the scroll box; the scrollbar is hidden (the row
// still scrolls by touch, wheel and keyboard focus).
// From 1100px: a vertical list of 40px rows.
const listCls =
  "m-0 flex list-none gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-0";

const itemBase =
  "inline-flex min-h-control-md items-center gap-2 whitespace-nowrap rounded-[999px] border px-3.5 py-2 text-left text-ui font-medium no-underline transition-[background-color,border-color,color] duration-fast motion-reduce:transition-none select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 lg:flex lg:w-full lg:min-h-10 lg:rounded lg:border-0 lg:px-3";

// Current: a filled pill in the row; a sunken, bold row in the column.
const itemCurrent =
  "border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] lg:bg-[var(--bg-sunken)] lg:font-semibold lg:text-[var(--fg-primary)]";

// Rest: an outlined pill in the row; a bare row in the column. `hover:`
// only fires on hover-capable devices (tailwind hoverOnlyWhenSupported).
const itemRest =
  "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--fg-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--fg-primary)] lg:bg-transparent lg:hover:bg-[var(--overlay-weak)]";

/**
 * Navigation between the sections of one page (DESIGN.md §9.13): Records
 * kinds, Settings sections, Help contents, Explore lists. Below 1100px it is
 * a scrolling row of pills above the content; from 1100px a vertical list
 * in a sidebar column. Items are links (`href`) or buttons (`onClick`); the
 * current one carries `aria-current` ("page" on links, "true" on buttons).
 */
export default function SideNav({
  "aria-label": ariaLabel,
  items,
  sticky = true,
  className = "",
}: SideNavProps) {
  const navCls = [
    sticky ? "lg:sticky lg:top-[calc(var(--top-bar-total)_+_32px)]" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <nav aria-label={ariaLabel} className={navCls || undefined}>
      <ul className={listCls}>
        {items.map((item) => {
          const { key, label, href, onClick, icon: Icon, count, current = false } = item;
          const cls = `${itemBase} ${current ? itemCurrent : itemRest}`;
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
