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
    const baseStyles =
      "rounded font-mono text-sm font-medium uppercase tracking-wider transition-all duration-150 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 inline-flex items-center justify-center gap-2";

    const variantStyles = {
      primary:
        "bg-accent/10 text-accent border border-accent/20 hover:bg-accent/15 hover:border-accent/35 hover:text-[#A3CDF2]",
      secondary:
        "bg-transparent text-navy border border-navy/20 hover:border-navy/40",
      ghost: "bg-transparent text-accent hover:bg-accent/10",
      destructive: "bg-error/10 text-error border border-error/20 hover:bg-error/15 hover:border-error/35",
    };

    const sizeStyles = {
      sm: "py-1.5 px-4 text-xs",
      md: "py-2.5 px-6 text-sm",
      lg: "py-3 px-8 text-sm",
    };

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
