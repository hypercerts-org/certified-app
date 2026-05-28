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
  // Quality labels (compact pill for activity feed).
  | "high-quality"
  | "standard"
  | "draft"
  | "test";

export interface BadgeProps {
  variant: BadgeVariant;
  children?: React.ReactNode;
  className?: string;
  /** When true, render compact (smaller padding + smaller font).
   *  Used by feed-quality labels and inline count chips. */
  compact?: boolean;
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
  // Neutral chips
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
}) => {
  const c = config[variant];
  // `compact` prop overrides; otherwise variant chooses its natural density.
  const isCompact = compact ?? c.defaultCompact;
  const sizeStyles = isCompact
    ? "px-2 py-0.5 text-[11px] font-semibold"
    : "px-3 py-1 text-body-sm font-medium";
  const baseStyles = `rounded-full inline-flex items-center gap-1.5 ${sizeStyles}`;

  return (
    <span className={`${baseStyles} ${c.styles} ${className}`}>
      {c.icon}
      {children}
    </span>
  );
};

export default Badge;
