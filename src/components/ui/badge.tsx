import React from "react";
import { CheckCircle, Clock } from "lucide-react";

export type BadgeVariant =
  // Status badges (carry an icon, semantic color).
  | "verified"
  | "pending"
  | "unverified"
  // Neutral chips (no icon, used as labels / tags / counts).
  | "tag"
  | "role"
  | "count"
  // Bare numeric count — muted number, NO background / border / padding.
  // For right-aligned section counts (e.g. home-section__count).
  | "count-bare"
  // Quality labels (compact pill for activity feed).
  | "high-quality"
  | "standard"
  | "draft"
  | "test";

/** Colour treatment for numeric variants.
 *  - "default": red attention pill (--badge-count-bg). The historical look.
 *  - "neutral": muted pill (--bg-sunken / --fg-muted) for non-attention counts. */
export type BadgeTone = "default" | "neutral";

export interface BadgeProps {
  variant: BadgeVariant;
  children?: React.ReactNode;
  className?: string;
  /** When true, render compact (smaller padding + smaller font).
   *  Used by feed-quality labels and inline count chips. */
  compact?: boolean;
  /** Colour treatment for the `count` variant. Defaults to "default" (red).
   *  Use "neutral" for counts that should not read as an alert.
   *  Ignored by every non-count variant. */
  tone?: BadgeTone;
}

interface VariantConfig {
  styles: string;
  icon: React.ReactNode;
  defaultCompact: boolean;
}

const config: Record<BadgeVariant, VariantConfig> = {
  verified: {
    styles: "bg-[var(--badge-success-bg)] text-[var(--badge-success-fg)]",
    icon: <CheckCircle className="h-4 w-4" aria-hidden="true" />,
    defaultCompact: false,
  },
  pending: {
    styles: "bg-[var(--badge-warning-bg)] text-[var(--badge-warning-fg)]",
    icon: <Clock className="h-4 w-4" aria-hidden="true" />,
    defaultCompact: false,
  },
  unverified: {
    styles:
      "bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)] border border-[var(--badge-neutral-border)]",
    icon: null,
    defaultCompact: false,
  },
  // Neutral chips — tag (label), role (membership), count (numeric).
  tag: {
    styles:
      "bg-[var(--bg-sunken)] text-[var(--fg-secondary)] uppercase tracking-wider",
    icon: null,
    defaultCompact: true,
  },
  role: {
    styles:
      "bg-[var(--bg-canvas)] text-[var(--fg-muted)] uppercase tracking-wider",
    icon: null,
    defaultCompact: true,
  },
  count: {
    styles:
      "bg-[var(--badge-count-bg)] text-[var(--badge-count-fg)] font-semibold",
    icon: null,
    defaultCompact: true,
  },
  // Bare numeric — no pill chrome, just a muted tabular number.
  "count-bare": {
    styles: "text-[var(--fg-muted)] font-semibold tabular-nums",
    icon: null,
    defaultCompact: true,
  },
  // Quality labels (compact pills)
  "high-quality": {
    styles: "bg-[var(--badge-success-bg)] text-[var(--badge-success-fg)]",
    icon: null,
    defaultCompact: true,
  },
  standard: {
    styles: "bg-[var(--bg-sunken)] text-[var(--fg-secondary)]",
    icon: null,
    defaultCompact: true,
  },
  draft: {
    styles: "bg-[var(--badge-warning-bg)] text-[var(--badge-warning-fg)]",
    icon: null,
    defaultCompact: true,
  },
  test: {
    styles: "bg-[var(--bg-raised)] text-[var(--fg-muted)]",
    icon: null,
    defaultCompact: true,
  },
};

const Badge: React.FC<BadgeProps> = ({
  variant,
  children,
  className = "",
  compact,
  tone = "default",
}) => {
  const c = config[variant];
  // tone="neutral" repaints the red `count` pill as a muted pill so neutral
  // counts can adopt Badge without reading as an alert. Only `count` carries a
  // tone — every other variant ignores it.
  const toneStyles =
    variant === "count" && tone === "neutral"
      ? "bg-[var(--bg-sunken)] text-[var(--fg-muted)] font-semibold"
      : c.styles;

  // `count-bare` is chromeless: no pill, no border, no padding — just a number.
  if (variant === "count-bare") {
    return (
      <span
        className={`inline-flex items-center text-caption ${toneStyles} ${className}`}
      >
        {children}
      </span>
    );
  }

  // `compact` prop overrides; otherwise variant chooses its natural density.
  const isCompact = compact ?? c.defaultCompact;
  const sizeStyles = isCompact
    ? "px-2 py-0.5 text-caption font-semibold"
    : "px-3 py-1 text-body-sm font-medium";
  // All badges are pills (one shape per semantic). 999px per the radius rule;
  // rounded-full is reserved for circles (e.g. avatars).
  const baseStyles = `rounded-[999px] inline-flex items-center gap-1.5 ${sizeStyles}`;

  return (
    <span className={`${baseStyles} ${toneStyles} ${className}`}>
      {c.icon}
      {children}
    </span>
  );
};

export default Badge;
