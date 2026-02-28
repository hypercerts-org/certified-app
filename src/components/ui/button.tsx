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
      "rounded-sm font-sans text-xs font-medium uppercase tracking-[0.1em] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2 inline-flex items-center justify-center gap-2";

    const variantStyles = {
      primary:
        "bg-black text-white hover:opacity-70",
      secondary:
        "bg-transparent text-gray-700 border border-gray-300 hover:border-gray-400",
      ghost: "bg-transparent text-gray-500 hover:text-black",
      destructive: "bg-error/10 text-error border border-error/20 hover:bg-error/15 hover:border-error/35",
    };

    const sizeStyles = {
      sm: "py-1.5 px-4 text-xs",
      md: "py-2.5 px-6 text-xs",
      lg: "py-3 px-8 text-xs",
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
