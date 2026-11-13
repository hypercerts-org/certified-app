"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useRegisterPageHeader } from "@/lib/navbar-context";

export interface PageHeaderBack {
  href: string;
  /** Names the parent the link returns to, e.g. "Records". */
  label: string;
}

export interface PageHeaderProps {
  /** The page title. Rendered as the page's one visible `<h1>`. */
  title: React.ReactNode;
  /** One line of plain text in the secondary colour, capped at the measure. */
  description?: React.ReactNode;
  /**
   * Buttons on the right, at most one `primary`. Below 800px they wrap
   * under the title.
   */
  actions?: React.ReactNode;
  /** A small chevron-left link above the title, back to the parent page. */
  back?: PageHeaderBack;
  /** Optional leading avatar or icon beside the title. */
  visual?: React.ReactNode;
  /**
   * A small control right after the title, on its line (e.g. Feed and
   * Explore's "Seen as" switcher). Wraps under the title when the line is
   * too narrow. Keep it out of `title`, so the `<h1>` stays just the name.
   */
  titleAside?: React.ReactNode;
  className?: string;
  /** Id for the `<h1>`, so a region can point `aria-labelledby` at it. */
  titleId?: string;
}

/**
 * The one page header pattern (DESIGN.md §9.13): optional back link, the
 * title as the page's `<h1>` (serif `text-h2`), one line of description,
 * and actions on the right.
 *
 * Mounting it registers with the navbar context (`useRegisterPageHeader`),
 * which tells the chrome that the page owns its `<h1>`, so the chrome
 * skips its own. Render one per page, as the first thing inside
 * `<PageContainer>`; the container handles the space above it, and the
 * header carries the 16px below it.
 */
export default function PageHeader({
  title,
  description,
  actions,
  back,
  visual,
  titleAside,
  className = "",
  titleId,
}: PageHeaderProps) {
  useRegisterPageHeader({ hasBack: !!back });

  return (
    <header className={`mb-4 flex flex-col gap-2 ${className}`.trim()}>
      {back ? (
        <Link
          href={back.href}
          // 32px tall; the ::after stretches the hit area to 44px for touch.
          className="relative inline-flex min-h-control-compact items-center gap-1 self-start rounded text-ui font-medium text-[var(--fg-muted)] no-underline transition-colors duration-fast motion-reduce:transition-none select-none [-webkit-touch-callout:none] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
        >
          <ChevronLeft size={14} strokeWidth={1.75} aria-hidden />
          {back.label}
        </Link>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="flex min-w-0 items-center gap-3 md:flex-1">
          {visual ? <div className="shrink-0">{visual}</div> : null}
          <div className="min-w-0">
            {titleAside ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1
                  id={titleId}
                  className="m-0 font-headline text-h2 text-[var(--fg-primary)] text-balance"
                >
                  {title}
                </h1>
                {titleAside}
              </div>
            ) : (
              <h1
                id={titleId}
                className="m-0 font-headline text-h2 text-[var(--fg-primary)] text-balance"
              >
                {title}
              </h1>
            )}
            {description ? (
              <p className="mb-0 mt-1 max-w-measure text-body-sm text-[var(--fg-secondary)] text-pretty">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
