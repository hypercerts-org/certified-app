import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./button";

export interface PaginationProps {
  /**
   * Current page, 1-based (page 1 is the first page). Matches the
   * profile-endorsements `usePagination` convention.
   */
  page: number;
  /** Total number of pages. Renders nothing when <= 1. */
  pageCount: number;
  /** Called with the requested 1-based page number. */
  onChange: (page: number) => void;
  /** Accessible label for the nav landmark. */
  label?: string;
  className?: string;
}

/**
 * Previous / "Page X of Y" / Next control. Canonical replacement for the
 * hand-built profile-endorsements pager (its only consumer). Restores the
 * prior look: a centered cluster of bordered Prev/Next buttons around a
 * tabular-nums status. Buttons disable at the bounds; the whole control
 * hides when there's a single page.
 */
export default function Pagination({
  page,
  pageCount,
  onChange,
  label = "Pagination",
  className = "",
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const atStart = page <= 1;
  const atEnd = page >= pageCount;

  return (
    <nav
      aria-label={label}
      className={`flex items-center justify-center gap-3 ${className}`}
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={atStart}
        aria-label="Previous page"
      >
        <ChevronLeft size={14} aria-hidden="true" />
        <span>Previous</span>
      </Button>
      <span
        className="text-body-sm text-[var(--fg-muted)] tabular-nums"
        aria-live="polite"
      >
        Page {page} of {pageCount}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={atEnd}
        aria-label="Next page"
      >
        <span>Next</span>
        <ChevronRight size={14} aria-hidden="true" />
      </Button>
    </nav>
  );
}
