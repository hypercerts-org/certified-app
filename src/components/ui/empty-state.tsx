import React from "react";

/**
 * Structural icon type — accepts both lucide-react icons and our
 * own wrapper components (e.g. `CertIcon` wrapping a tabler icon).
 * Both lucides and tablers expose `size` + `strokeWidth`.
 */
export type EmptyStateIcon = React.ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
}>;

export interface EmptyStateProps {
  icon?: EmptyStateIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  /**
   * Visual density.
   * - `"rich"` (default): the centered block with optional icon, headline
   *   title, description, and CTA slot. Use for full-section placeholders.
   * - `"inline"`: the truly minimal single-line hint for the ~12 inline
   *   `*__empty` slots (`home-section__empty`, `org-list__empty`,
   *   `right-rail__empty`, …). One muted line of text — no icon, no headline
   *   weight, no container, zero margin. This is the canonical replacement for
   *   those one-off BEM classes.
   * - `"compact"`: alias of `"inline"`, kept for back-compat. New code should
   *   prefer `"inline"`.
   *
   * Both `"inline"` and `"compact"` drop the icon, render the title as quiet
   * muted body text instead of a headline, and let the description (when
   * present) and CTA slot follow inline so the whole hint reads as one line.
   */
  variant?: "rich" | "inline" | "compact";
}

/**
 * Reusable empty/placeholder state shown when a list or section has no content.
 *
 * The default `"rich"` variant renders a centered block with optional icon,
 * title, description, and CTA slot. The `"inline"` variant (and its `"compact"`
 * alias) collapses to a single muted line for inline list/section hints —
 * replacing the scattered one-off `*__empty` BEM classes with one primitive.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className = "",
  variant = "rich",
}: EmptyStateProps) {
  if (variant === "inline" || variant === "compact") {
    // Truly minimal: icon-less, single-line, muted. Mirrors the inline
    // `*__empty` hints (text-sm + --fg-muted, zero margin, no centering, no
    // headline weight, no container). The CTA slot is still honored (some
    // inline hints append a "create one" link) but stays inline so the whole
    // hint reads as one line.
    return (
      <p
        className={`m-0 text-sm text-[var(--fg-muted)] ${className}`}
      >
        {title}
        {description && (
          <span className="text-[var(--fg-muted)]"> {description}</span>
        )}
        {children && <span className="ml-1">{children}</span>}
      </p>
    );
  }

  // `empty-state` class retained on the root only as a hook for the external
  // contextual overrides that key on it via parent selectors (e.g.
  // `.profile-endorsements-v2__grid > .empty-state` in profile-endorsements.css,
  // `.profile-certs .feed > .empty-state` in layout.css). The base look below is
  // self-contained Tailwind mirroring the `.empty-state*` rules in components.css.
  return (
    <div
      className={`empty-state flex flex-col items-center px-4 py-12 text-center ${className}`}
    >
      {Icon && (
        <div
          className="mb-4 text-[var(--fg-muted)] opacity-50"
          aria-hidden="true"
        >
          <Icon size={40} strokeWidth={1.2} />
        </div>
      )}
      <h3 className="mb-2 font-headline text-[1.125rem] font-semibold text-[var(--fg-primary)]">
        {title}
      </h3>
      {description && (
        <p className="max-w-[320px] text-[0.875rem] leading-[1.6] text-[var(--fg-muted)]">
          {description}
        </p>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
