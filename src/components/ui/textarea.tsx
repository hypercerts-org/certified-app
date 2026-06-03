import React, { useId, useState } from "react";

export type TextareaSize = "sm" | "md" | "lg";
export type TextareaVariant = "default" | "underline";

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  rows?: number;
  size?: TextareaSize;
  variant?: TextareaVariant;
  /**
   * When set alongside `showCount`, renders a live "n / max" affordance under
   * the field. `maxLength` is also forwarded to the native element so the
   * browser enforces the cap.
   */
  showCount?: boolean;
}

// Mirrors Input's size axis: padding + text scale. Height comes from `rows`.
const sizeClasses: Record<TextareaSize, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-3 text-base md:text-sm",
  lg: "px-5 py-4 text-base",
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      rows = 3,
      size = "md",
      variant = "default",
      className = "",
      showCount = false,
      maxLength,
      id,
      disabled,
      value,
      defaultValue,
      onChange,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const textareaId = id || autoId;
    const errorId = error ? `${textareaId}-error` : undefined;
    const helperId = !error && helperText ? `${textareaId}-helper` : undefined;
    const counterId = showCount ? `${textareaId}-count` : undefined;
    const describedBy =
      [errorId, helperId, counterId].filter(Boolean).join(" ") || undefined;

    // Track length for the live counter. When the field is controlled we read
    // straight from `value`; otherwise we keep our own count seeded from
    // `defaultValue` so the affordance still updates as the user types.
    const isControlled = value !== undefined;
    const [uncontrolledLen, setUncontrolledLen] = useState(
      typeof defaultValue === "string" ? defaultValue.length : 0
    );
    const currentLen = isControlled
      ? String(value ?? "").length
      : uncontrolledLen;

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!isControlled) setUncontrolledLen(e.target.value.length);
      onChange?.(e);
    };

    const baseChrome =
      "w-full bg-[var(--bg-elevated)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none transition-all duration-150 motion-reduce:transition-none resize-y";

    const disabledChrome = disabled
      ? "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-[var(--bg-sunken)] disabled:resize-none"
      : "";

    const variantChrome =
      variant === "underline"
        ? `border-0 border-b ${
            error
              ? "border-[var(--color-error-border)]"
              : "border-[var(--border-medium)]"
          } rounded-none bg-transparent focus:border-[var(--fg-primary)]`
        : `border ${
            error
              ? "border-[var(--color-error-border)]"
              : "border-[var(--border-default)]"
          } rounded focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]/20`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="app-card__label block mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${sizeClasses[size]} ${baseChrome} ${variantChrome} ${disabledChrome} ${className}`}
          {...props}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
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
              <p
                id={helperId}
                className="mt-1.5 text-xs text-[var(--fg-muted)]"
              >
                {helperText}
              </p>
            )}
          </div>
          {showCount && (
            <p
              id={counterId}
              aria-live="polite"
              className="mt-1.5 shrink-0 text-xs tabular-nums text-[var(--fg-muted)]"
            >
              {maxLength != null ? `${currentLen} / ${maxLength}` : currentLen}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
