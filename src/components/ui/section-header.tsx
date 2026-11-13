import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface SectionHeaderProps {
  title: React.ReactNode;
  /** One line of muted text under the title. */
  description?: React.ReactNode;
  /** Right side: a `<SeeAllLink>` or a small button. */
  action?: React.ReactNode;
  /** Outline level. `h2` under the page's h1 (default); `h3` inside an h2 section. */
  as?: "h2" | "h3";
  /** Id for the heading, so the section can point `aria-labelledby` at it. */
  id?: string;
  className?: string;
}

/**
 * The heading of a section inside a page (DESIGN.md §9.13): the title in
 * the `text-section` role (Inter 600, 1rem; never serif), an optional
 * description and an optional action on the right.
 *
 * It carries no outer margin. Put it first in the section and give the
 * section's content 12px below it (`flex flex-col gap-3`, or `mt-3`).
 */
export default function SectionHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  id,
  className = "",
}: SectionHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`.trim()}>
      <div className="flex min-w-0 flex-col gap-1">
        <Heading
          id={id}
          className="m-0 text-section text-[var(--fg-primary)] text-balance"
        >
          {title}
        </Heading>
        {description ? (
          <p className="m-0 max-w-measure text-body-sm text-[var(--fg-muted)] text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {/* Level with the title: the slot is pulled up by half the difference
          between a 32px control and the title's line (text-section, leading
          1.4), so a SeeAllLink or small button is centred on that line
          instead of hanging 5px below it. A taller action (a 44px phone
          button, a wrapping group) only grows downward, never over the
          content above, and the title never moves. */}
      {action ? (
        <div className="mt-[calc((1.4rem_-_var(--control-h-compact))/2)] flex shrink-0 items-center">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export interface SeeAllLinkProps {
  href: string;
  /** Defaults to "See all". Name the destination when it isn't obvious. */
  label?: string;
  className?: string;
}

/**
 * The one "See all" link, for a `SectionHeader` action: `text-ui` 500 in
 * the secondary colour with a 14px chevron. 32px tall, with the hit area
 * stretched to 44px for touch.
 */
export function SeeAllLink({ href, label = "See all", className = "" }: SeeAllLinkProps) {
  return (
    <Link
      href={href}
      className={`relative inline-flex min-h-control-compact items-center gap-1 rounded text-ui font-medium text-[var(--fg-secondary)] no-underline transition-colors duration-fast motion-reduce:transition-none select-none [-webkit-touch-callout:none] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] ${className}`.trim()}
    >
      {label}
      <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
    </Link>
  );
}
