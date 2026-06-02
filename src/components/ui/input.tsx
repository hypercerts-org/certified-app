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
  /**
   * Optional addon glyph rendered inside the field, before the text. The
   * wrapper positions it and the input is padded so text never overlaps it.
   * A bare <Input> with no icons renders exactly as before (no wrapper cost).
   */
  leadingIcon?: React.ReactNode;
  /** Optional addon glyph rendered inside the field, after the text. */
  trailingIcon?: React.ReactNode;
}

const sizeClasses: Record<InputSize, string> = {
  // 36 / 44 / 56 — Tailwind's h-9 / h-11 / h-14.
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base md:text-sm",
  lg: "h-14 px-5 text-base",
};

// Horizontal padding the input picks up when an icon occupies that side, so
// the caret/text clears the glyph. Mirrors sizeClasses' base px per size.
const leadingPadClasses: Record<InputSize, string> = {
  sm: "pl-9",
  md: "pl-11",
  lg: "pl-12",
};
const trailingPadClasses: Record<InputSize, string> = {
  sm: "pr-9",
  md: "pr-11",
  lg: "pr-12",
};

// Where the absolutely-positioned icon sits, per side and size.
const leadingIconPos: Record<InputSize, string> = {
  sm: "left-3",
  md: "left-4",
  lg: "left-5",
};
const trailingIconPos: Record<InputSize, string> = {
  sm: "right-3",
  md: "right-4",
  lg: "right-5",
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
      leadingIcon,
      trailingIcon,
      id,
      disabled,
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
      "w-full bg-[var(--bg-elevated)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none transition-all duration-150 motion-reduce:transition-none";

    // Muted fill + not-allowed cursor when disabled. Semantic tokens keep the
    // treatment correct in dark mode.
    const disabledChrome = disabled
      ? "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-[var(--bg-sunken)]"
      : "";

    const variantChrome = (() => {
      switch (variant) {
        case "underline":
          // No box, no radius — just a bottom-border that intensifies on focus.
          // Used by typeahead inputs that should disappear into their container.
          return `border-0 border-b ${
            error
              ? "border-[var(--color-error-border)]"
              : "border-[var(--border-medium)]"
          } rounded-none bg-transparent focus:border-[var(--fg-primary)]`;
        case "inline-edit":
          // Slightly thicker border (1.5 px) signals "currently editable" —
          // used by profile inline-edit name/website fields. Otherwise
          // identical to the default chrome.
          return `border-[1.5px] ${
            error
              ? "border-[var(--color-error-border)]"
              : "border-[var(--border-hover)] focus:border-[var(--focus-ring)]"
          } rounded`;
        case "default":
        default:
          return `border ${
            error
              ? "border-[var(--color-error-border)]"
              : "border-[var(--border-default)]"
          } rounded focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]/20`;
      }
    })();

    const iconPad = `${leadingIcon ? leadingPadClasses[size] : ""} ${
      trailingIcon ? trailingPadClasses[size] : ""
    }`;

    const inputEl = (
      <input
        ref={ref}
        id={inputId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${sizeClasses[size]} ${iconPad} ${baseChrome} ${variantChrome} ${disabledChrome} ${className}`}
        {...props}
      />
    );

    // Only pay for the relative wrapper + absolute icons when an addon exists.
    const field =
      leadingIcon || trailingIcon ? (
        <div className="relative w-full">
          {leadingIcon && (
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${leadingIconPos[size]} flex items-center text-[var(--fg-muted)]`}
            >
              {leadingIcon}
            </span>
          )}
          {inputEl}
          {trailingIcon && (
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${trailingIconPos[size]} flex items-center text-[var(--fg-muted)]`}
            >
              {trailingIcon}
            </span>
          )}
        </div>
      ) : (
        inputEl
      );

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="app-card__label block mb-1.5">
            {label}
          </label>
        )}
        {field}
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

Input.displayName = "Input";

export default Input;
