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
   * - `"compact"`: a single muted line of text for the ~12 inline `*__empty`
   *   hints ("No updates yet.", "No endorsements yet.", …). The icon is
   *   dropped, the title renders as quiet muted body text instead of a
   *   headline, and the description (when present) follows inline.
   */
  variant?: "rich" | "compact";
}

/**
 * Reusable empty/placeholder state shown when a list or section has no content.
 *
 * The default `"rich"` variant renders a centered block with optional icon,
 * title, description, and CTA slot. The `"compact"` variant collapses to a
 * single muted line for inline list/section hints — replacing the scattered
 * one-off `*__empty` BEM classes with one primitive.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className = "",
  variant = "rich",
}: EmptyStateProps) {
  if (variant === "compact") {
    // Icon-less, single-line, muted. Mirrors the inline `*__empty` hints:
    // text-sm + --fg-muted, no centering, no headline weight. The CTA slot is
    // still honored (some inline hints append a "create one" link) but stays
    // inline so the whole hint reads as one line.
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

  return (
    <div className={`empty-state ${className}`}>
      {Icon && (
        <div className="empty-state__icon" aria-hidden="true">
          <Icon size={40} strokeWidth={1.2} />
        </div>
      )}
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__desc">{description}</p>}
      {children && <div className="empty-state__actions">{children}</div>}
    </div>
  );
}
