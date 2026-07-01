import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

export type BannerVariant = "info" | "warning" | "success" | "error";

export interface BannerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Visual tone + default leading icon + ARIA role. */
  variant?: BannerVariant;
  /** Optional bold lead line above the body copy. */
  title?: React.ReactNode;
  /**
   * Override the default per-variant leading icon. Pass `false` to render no
   * icon at all (the body then spans the full width).
   */
  icon?: React.ReactNode | false;
  /**
   * When provided, renders a trailing dismiss button. The handler is wired to
   * its onClick; the banner does not manage its own visibility, so the caller
   * is responsible for unmounting on dismiss.
   */
  onDismiss?: () => void;
  /** Accessible label for the dismiss button. Defaults to "Dismiss". */
  dismissLabel?: string;
}

// Per-variant tint surface + border. Every token here has a dark-mode override
// in tokens.css, so the banner flips with the theme. `info` and `success` have
// no dedicated border token, so they borrow the neutral --border-default —
// still theme-aware.
const variantSurface: Record<BannerVariant, string> = {
  info: "bg-[var(--bg-sunken)] border-[var(--border-default)]",
  warning:
    "bg-[var(--color-warning-bg)] border-[var(--color-warning-border)]",
  success: "bg-[var(--color-success-bg)] border-[var(--border-default)]",
  error: "bg-[var(--color-error-bg)] border-[var(--color-error-border)]",
};

// Accent colour for the leading icon, per variant.
const variantAccent: Record<BannerVariant, string> = {
  info: "text-[var(--fg-muted)]",
  warning: "text-[var(--color-warning-text)]",
  success: "text-[var(--color-success-text)]",
  error: "text-[var(--color-error)]",
};

const variantIcon: Record<BannerVariant, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  error: AlertCircle,
};

// error/warning carry actionable failures → assertive `alert`; info/success
// are passive status → polite `status`.
const variantRole: Record<BannerVariant, "alert" | "status"> = {
  info: "status",
  warning: "alert",
  success: "status",
  error: "alert",
};

const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  (
    {
      variant = "info",
      title,
      icon,
      onDismiss,
      dismissLabel = "Dismiss",
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const DefaultIcon = variantIcon[variant];
    const showIcon = icon !== false;
    const leadingIcon =
      icon !== undefined && icon !== false ? (
        icon
      ) : (
        <DefaultIcon className={`h-5 w-5 ${variantAccent[variant]}`} />
      );

    return (
      <div
        ref={ref}
        role={variantRole[variant]}
        className={`flex gap-3 rounded border p-4 text-sm text-[var(--fg-primary)] ${variantSurface[variant]} ${className}`}
        {...props}
      >
        {showIcon && (
          <span
            aria-hidden="true"
            className={`flex-shrink-0 mt-px ${variantAccent[variant]}`}
          >
            {leadingIcon}
          </span>
        )}
        <div className="flex-1 min-w-0">
          {title && (
            <p className="font-semibold tracking-wider text-[var(--fg-primary)]">
              {title}
            </p>
          )}
          {children && (
            <div
              className={`text-[var(--fg-secondary)] ${title ? "mt-1" : ""}`}
            >
              {children}
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            className="flex-shrink-0 -mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded text-[var(--fg-muted)] transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--overlay-weak)] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
);

Banner.displayName = "Banner";

export default Banner;
