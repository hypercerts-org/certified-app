import React from "react";
import { Loader2 } from "lucide-react";
import Tooltip from "@/components/ui/tooltip";

type ButtonSize = "sm" | "md" | "lg" | "icon";

// Icon-size requires aria-label so screen readers have something to read.
// All other sizes accept children as the accessible label and aria-label is optional.
type ButtonBaseProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  loading?: boolean;
  // Toggle support: when provided, the button reports aria-pressed so it can
  // back an aria-pressed control. A truthy value also flips secondary/ghost
  // variants to an "active" visual (other variants keep their base look).
  pressed?: boolean;
  // Hover/focus tooltip text. Icon buttons fall back to their aria-label when
  // this is omitted, so every icon button explains itself on hover for free;
  // pass an explicit string to override or to add a tooltip to a text button.
  tooltip?: string;
};

type IconButtonProps = ButtonBaseProps & {
  size: "icon";
  "aria-label": string;
  children: React.ReactNode;
};

type LabelButtonProps = ButtonBaseProps & {
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
};

export type ButtonProps = IconButtonProps | LabelButtonProps;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      pressed,
      tooltip,
      type = "button",
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "rounded text-sm font-medium tracking-wider transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 inline-flex items-center justify-center gap-2 press-scale";

    const variantStyles = {
      primary:
        "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] border-none hover:opacity-90",
      secondary:
        "bg-transparent text-[var(--fg-primary)] border border-[var(--border-default)] hover:border-[var(--border-hover)]",
      ghost:
        "bg-transparent text-[var(--fg-muted)] hover:bg-[var(--overlay-weak)] hover:text-[var(--fg-primary)]",
      destructive:
        "bg-[var(--color-error-bg)] text-[var(--color-error)] border border-[var(--color-error-border)] hover:opacity-90",
    };

    // Mobile tap targets: every size meets the 44px WCAG 2.5.5 minimum below
    // 800px, then reverts to its compact desktop dimensions at `md` (= 800px,
    // the canonical breakpoint). `min-h-11` (44px) wins over the smaller
    // padding-driven height on mobile without touching the desktop look.
    const sizeStyles: Record<ButtonSize, string> = {
      sm: "py-1.5 px-4 text-xs min-h-11 md:min-h-0",
      md: "py-2.5 px-6 text-sm min-h-11 md:min-h-0",
      lg: "py-3 px-8 text-sm",
      // 44 x 44 on mobile, 40 x 40 on desktop. Padding zeroed; the icon child
      // sits in the centered flex slot.
      icon: "h-11 w-11 md:h-10 md:w-10 p-0 text-sm",
    };

    const disabledStyles = disabled || loading ? "opacity-50 cursor-not-allowed" : "";

    // Active visual for toggle buttons. Only secondary/ghost have an "off" look
    // distinct enough that a pressed state reads as on; primary/destructive keep
    // their base styling.
    const pressedStyles: Partial<Record<NonNullable<ButtonProps["variant"]>, string>> = {
      secondary:
        "bg-[var(--overlay-medium)] text-[var(--fg-primary)] border-[var(--border-hover)]",
      ghost: "bg-[var(--overlay-medium)] text-[var(--fg-primary)]",
    };
    const activeStyles = pressed ? pressedStyles[variant] ?? "" : "";

    // Icon buttons explain themselves on hover via their required aria-label;
    // an explicit `tooltip` overrides that, and is the only source for the
    // (rare) text button that opts into a tooltip.
    const ariaLabel = (props as { "aria-label"?: string })["aria-label"];
    const tooltipText = tooltip ?? (size === "icon" ? ariaLabel : undefined);

    const button = (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-pressed={pressed}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${activeStyles} ${disabledStyles} ${className}`}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
        {/* For icon-size, the 40x40 slot fits one glyph: while loading, show
            only the spinner so it doesn't overlap the icon child. */}
        {!(loading && size === "icon") && children}
      </button>
    );

    if (tooltipText) {
      return <Tooltip label={tooltipText}>{button}</Tooltip>;
    }
    return button;
  }
);

Button.displayName = "Button";

export default Button;
