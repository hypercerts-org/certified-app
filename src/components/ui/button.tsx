import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    // Base styles
    const baseStyles =
      "rounded-button font-medium text-body transition-all duration-200 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex items-center justify-center gap-2";

    // Variant styles
    const variantStyles = {
      primary:
        "bg-accent text-white hover:bg-[#6EAEE8] hover:shadow-[0_4px_12px_rgba(96,161,226,0.3)]",
      secondary:
        "bg-transparent text-navy border-[1.5px] border-navy hover:bg-navy hover:text-white",
      ghost: "bg-transparent text-accent hover:bg-accent/10",
      destructive: "bg-error text-white hover:bg-[#D13426]",
    };

    // Size styles
    const sizeStyles = {
      sm: "py-2 px-4 text-body-sm",
      md: "py-3 px-6",
      lg: "py-4 px-8 text-h4",
    };

    // Disabled styles
    const disabledStyles = disabled || loading ? "opacity-50 cursor-not-allowed" : "";

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${className}`}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
