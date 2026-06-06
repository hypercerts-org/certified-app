import React, { useId } from "react";
import { ChevronDown } from "lucide-react";

export type SelectSize = "sm" | "md" | "lg";

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: SelectSize;
}

// Mirrors Input's size axis. Right padding leaves room for the chevron overlay.
// `sm` keeps its compact 36px height on desktop but meets the 44px tap target
// below the canonical 800px breakpoint (mirrors Button's mobile bump).
const sizeClasses: Record<SelectSize, string> = {
  sm: "h-9 pl-3 pr-9 text-sm min-h-11 md:min-h-0",
  md: "h-11 pl-4 pr-10 text-base md:text-sm",
  lg: "h-14 pl-5 pr-11 text-base",
};

// Chevron horizontal inset, per size — keeps it visually aligned with the
// field's right padding.
const chevronPos: Record<SelectSize, string> = {
  sm: "right-3",
  md: "right-4",
  lg: "right-5",
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      size = "md",
      className = "",
      id,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const selectId = id || autoId;
    const errorId = error ? `${selectId}-error` : undefined;
    const helperId = !error && helperText ? `${selectId}-helper` : undefined;
    const describedBy =
      [errorId, helperId].filter(Boolean).join(" ") || undefined;

    const baseChrome =
      "w-full appearance-none bg-[var(--bg-elevated)] text-[var(--fg-primary)] focus:outline-none transition-all duration-150 motion-reduce:transition-none";

    const borderChrome = `border ${
      error
        ? "border-[var(--color-error-border)]"
        : "border-[var(--border-default)]"
    } rounded focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]/20`;

    const disabledChrome = disabled
      ? "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-[var(--bg-sunken)]"
      : "";

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block mb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-[var(--color-mid-gray)] [font-feature-settings:'case'_1]"
          >
            {label}
          </label>
        )}
        <div className="relative w-full">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            // The native option list is painted by the OS/UA; styling it is not
            // portable. We set the surface tokens so platforms that DO honour
            // them (most desktop Chromium/Firefox) render dark-correct options.
            className={`${sizeClasses[size]} ${baseChrome} ${borderChrome} ${disabledChrome} [&>option]:bg-[var(--bg-elevated)] [&>option]:text-[var(--fg-primary)] ${className}`}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${chevronPos[size]} text-[var(--fg-muted)]`}
          />
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 text-xs text-[var(--color-error)]"
          >
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={helperId} className="mt-1.5 text-xs text-[var(--fg-muted)]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

export default Select;
