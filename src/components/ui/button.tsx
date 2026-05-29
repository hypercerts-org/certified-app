import React from "react";
import { Loader2 } from "lucide-react";

type ButtonSize = "sm" | "md" | "lg" | "icon";

// Icon-size requires aria-label so screen readers have something to read.
// All other sizes accept children as the accessible label and aria-label is optional.
type ButtonBaseProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  loading?: boolean;
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
      type = "button",
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "rounded text-sm font-medium tracking-wider transition-all duration-150 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex items-center justify-center gap-2 press-scale";

    const variantStyles = {
      primary:
        "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] border-none hover:opacity-90",
      secondary:
        "bg-transparent text-[var(--fg-primary)] border border-[var(--border-default)] hover:border-[var(--border-hover)]",
      ghost:
        "bg-transparent text-[var(--fg-muted)] hover:bg-[var(--overlay-weak)] hover:text-[var(--fg-primary)]",
      destructive:
        "bg-error/10 text-error border border-error/20 hover:bg-error/15 hover:border-error/35",
    };

    const sizeStyles: Record<ButtonSize, string> = {
      sm: "py-1.5 px-4 text-xs",
      md: "py-2.5 px-6 text-sm",
      lg: "py-3 px-8 text-sm",
      // 40 x 40 square. Padding zeroed; children (an icon) sit in the centered flex slot.
      icon: "h-10 w-10 p-0 text-sm",
    };

    const disabledStyles = disabled || loading ? "opacity-50 cursor-not-allowed" : "";

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${className}`}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {/* For icon-size, the 40x40 slot fits one glyph: while loading, show
            only the spinner so it doesn't overlap the icon child. */}
        {!(loading && size === "icon") && children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
