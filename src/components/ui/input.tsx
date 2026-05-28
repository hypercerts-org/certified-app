import React, { useId } from "react";

export type InputSize = "sm" | "md" | "lg";
export type InputVariant = "default" | "underline" | "inline-edit";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: InputSize;
  variant?: InputVariant;
}

const sizeClasses: Record<InputSize, string> = {
  // 36 / 44 / 56 — Tailwind's h-9 / h-11 / h-14.
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base md:text-sm",
  lg: "h-14 px-5 text-base",
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      size = "md",
      variant = "default",
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const inputId = id || autoId;
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = !error && helperText ? `${inputId}-helper` : undefined;
    const describedBy = [errorId, helperId].filter(Boolean).join(" ") || undefined;

    const baseChrome =
      "w-full bg-[var(--bg-elevated)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none transition-all duration-150";

    const variantChrome = (() => {
      switch (variant) {
        case "underline":
          // No box, no radius — just a bottom-border that intensifies on focus.
          // Used by typeahead inputs that should disappear into their container.
          return `border-0 border-b ${
            error ? "border-error/40" : "border-[var(--border-medium)]"
          } rounded-none bg-transparent focus:border-[var(--fg-primary)]`;
        case "inline-edit":
          // Slightly thicker border (1.5 px) signals "currently editable" —
          // used by profile inline-edit name/website fields. Otherwise
          // identical to the default chrome.
          return `border-[1.5px] ${
            error
              ? "border-error/40"
              : "border-[var(--border-hover)] focus:border-[var(--focus-ring)]"
          } rounded`;
        case "default":
        default:
          return `border ${
            error ? "border-error/40" : "border-[var(--border-default)]"
          } rounded focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]/20`;
      }
    })();

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="app-card__label block mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${sizeClasses[size]} ${baseChrome} ${variantChrome} ${className}`}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-error">{error}</p>
        )}
        {!error && helperText && (
          <p id={helperId} className="mt-1.5 text-xs text-[var(--fg-muted)]">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
