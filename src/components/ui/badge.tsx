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

/** Colour treatment.
 *  Count pills (`variant="count"`):
 *  - "default": red attention pill (--badge-count-bg). The historical look.
 *  - "neutral": muted pill (--bg-sunken / --fg-muted) for non-attention counts.
 *  Square tags (`shape="square"`): "error" | "warn" | "success" | "neutral".
 *  ("warn" is an alias of "error" so a draft/warn tag reads error-toned, matching
 *  the legacy home-feed__preview-tag--warn look.) */
export type BadgeTone =
  | "default"
  | "neutral"
  | "error"
  | "warn"
  | "success";

/** Visual shape. Defaults to "pill" (999px) — the one-shape-per-semantic rule.
 *  "square" renders a small rounded-[var(--radius)] (2px) chip for error / warn /
 *  success / neutral tags (e.g. home-feed__preview-tag), tone selected via `tone`. */
export type BadgeShape = "pill" | "square";

/** Square-tag palettes. Each pairs an error/warn/success/neutral tone with tokens
 *  that already flip in dark mode, mirroring the legacy preview-tag BEM look:
 *  neutral = sunken fill + medium border; error/warn = transparent + error tint. */
const squareToneStyles: Record<
  Exclude<BadgeTone, "default">,
  string
> = {
  neutral:
    "bg-[var(--bg-sunken)] text-[var(--fg-secondary)] border border-[var(--border-medium)]",
  error:
    "bg-transparent text-[var(--color-error)] border border-[var(--color-error)]",
  // "warn" tags are error-toned by design (the draft/warn preview tag is red).
  warn: "bg-transparent text-[var(--color-error)] border border-[var(--color-error)]",
  success:
    "bg-[var(--color-success-bg)] text-[var(--color-success-text)] border border-[var(--color-success-text)]",
};

export interface BadgeProps {
  variant: BadgeVariant;
  children?: React.ReactNode;
  className?: string;
  /** When true, render compact (smaller padding + smaller font).
   *  Used by feed-quality labels and inline count chips. */
  compact?: boolean;
  /** Colour treatment. For `variant="count"`: "default" (red) | "neutral" (muted).
   *  For `shape="square"`: "error" | "warn" | "success" | "neutral" (defaults to
   *  "neutral"). Ignored by every other variant/shape combination. */
  tone?: BadgeTone;
  /** Shape modifier. Defaults to "pill" (999px). Pass "square" to render a small
   *  rounded-[var(--radius)] (2px) tag chip honoring the `tone` palette. */
  shape?: BadgeShape;
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
  shape = "pill",
}) => {
  const c = config[variant];
  const isSquare = shape === "square";

  // Square tags swap their whole palette by `tone` (error/warn/success/neutral).
  // The default "default" tone has no square meaning, so fall back to "neutral".
  const squarePalette =
    squareToneStyles[tone === "default" ? "neutral" : tone];

  // tone="neutral" repaints the red `count` pill as a muted pill so neutral
  // counts can adopt Badge without reading as an alert. Only `count` carries a
  // tone — every other (pill) variant ignores it.
  const toneStyles = isSquare
    ? squarePalette
    : variant === "count" && tone === "neutral"
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
  // Square tags are inherently compact (small uppercase chips) unless told otherwise.
  const isCompact = compact ?? (isSquare ? true : c.defaultCompact);
  const sizeStyles = isCompact
    ? "px-2 py-0.5 text-caption font-semibold"
    : "px-3 py-1 text-body-sm font-medium";
  // Pills are 999px (one shape per semantic; rounded-full is reserved for circles).
  // Square tags use var(--radius) (2px) and pick up uppercase tracking like a tag.
  const shapeStyles = isSquare
    ? "rounded-[var(--radius)] uppercase tracking-wider"
    : "rounded-[999px]";
  const baseStyles = `${shapeStyles} inline-flex items-center gap-1.5 ${sizeStyles}`;

  return (
    <span className={`${baseStyles} ${toneStyles} ${className}`}>
      {isSquare ? null : c.icon}
      {children}
    </span>
  );
};

export default Badge;
