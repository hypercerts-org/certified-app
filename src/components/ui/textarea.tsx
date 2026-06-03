import React, { useId, useState } from "react";

export type TextareaSize = "sm" | "md" | "lg" | "bare";
export type TextareaVariant = "default" | "underline";
/**
 * Resting + focus border treatment for the `default` variant — mirrors
 * Input's axis. `default` = 1 px `--border-default` with the accent
 * focus-ring (today's behaviour). `hover` = 1.5 px `--border-hover`
 * resolving to `--fg-primary` + a 2 px `--overlay-weak` ring on focus,
 * matching the cert-detail short-description holdout chrome. Ignored by
 * the `underline` variant.
 */
export type TextareaBorderWeight = "default" | "hover";
/**
 * Typographic density — mirrors Input. `default` keeps today's per-size
 * padding + text scale; `compact` is the 0.8125rem / 2px-6px meta scale.
 */
export type TextareaDensity = "default" | "compact";

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  rows?: number;
  size?: TextareaSize;
  variant?: TextareaVariant;
  /**
   * Border treatment for the `default` variant — see
   * {@link TextareaBorderWeight}. Defaults to `default`. Pass `"hover"`
   * for the 1.5 px "editable" weight the cert short-description holdout
   * uses. Ignored by the `underline` variant.
   */
  borderWeight?: TextareaBorderWeight;
  /**
   * Typographic density — see {@link TextareaDensity}. Defaults to
   * `default`.
   */
  density?: TextareaDensity;
  /**
   * Unwrapped / "flush" mode. When true, renders the bare `<textarea>`
   * with NO outer `w-full` wrapper `<div>` and NO label / error /
   * helper / counter block — so it composes directly as a flex / grid
   * child. `label`, `error`, `helperText`, and the `showCount` counter
   * are not rendered in this mode (the parent owns the surrounding
   * chrome). `aria-invalid` still reflects `error`. `maxLength` is still
   * forwarded so the browser cap holds. Alias: `unwrapped`.
   */
  flush?: boolean;
  /** Alias for {@link flush}. */
  unwrapped?: boolean;
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
  // No text-size / leading of its own — typography cascades from the
  // parent (e.g. the short-desc holdout's `font:inherit; font-size:1rem;
  // line-height:1.6`). Keep a default-ish padding so a bare textarea
  // isn't edge-to-edge; callers that need bespoke padding pass it via
  // `className`, which wins the cascade.
  bare: "px-3 py-2 font-[inherit] text-[length:inherit] leading-[inherit]",
};

// Compact density — the 0.8125rem / 2px-6px meta scale. Appended after
// sizeClasses so it wins. With `size="bare"` the text-size half is a
// no-op (length already inherits); the padding still applies.
const compactClasses = "py-0.5 px-1.5 text-[0.8125rem]";

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      rows = 3,
      size = "md",
      variant = "default",
      borderWeight = "default",
      density = "default",
      flush = false,
      unwrapped = false,
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
    const isFlush = flush || unwrapped;
    // Counter only exists in the wrapped layout — flush mode drops the
    // whole footer block, so don't even compute the affordance there.
    const showCounter = showCount && !isFlush;
    const errorId = !isFlush && error ? `${textareaId}-error` : undefined;
    const helperId =
      !isFlush && !error && helperText ? `${textareaId}-helper` : undefined;
    const counterId = showCounter ? `${textareaId}-count` : undefined;
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

    const variantChrome = (() => {
      if (variant === "underline") {
        return `border-0 border-b ${
          error
            ? "border-[var(--color-error-border)]"
            : "border-[var(--border-medium)]"
        } rounded-none bg-transparent focus:border-[var(--fg-primary)]`;
      }
      // default variant — two border families, chosen by `borderWeight`.
      // `hover` reproduces the short-desc holdout chrome (1.5px
      // --border-hover → --fg-primary + 2px --overlay-weak on focus).
      if (error) {
        // `border` (1px) for default weight is byte-identical to the
        // pre-enhancement string; `border-[1.5px]` for hover weight.
        return borderWeight === "hover"
          ? "border-[1.5px] border-[var(--color-error-border)] rounded focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]/20"
          : "border border-[var(--color-error-border)] rounded focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]/20";
      }
      if (borderWeight === "hover") {
        return "border-[1.5px] border-[var(--border-hover)] rounded focus:border-[var(--fg-primary)] focus:ring-2 focus:ring-[var(--overlay-weak)]";
      }
      return "border border-[var(--border-default)] rounded focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]/20";
    })();

    const densityClasses = density === "compact" ? compactClasses : "";

    const textareaEl = (
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
        className={`${sizeClasses[size]} ${densityClasses} ${baseChrome} ${variantChrome} ${disabledChrome} ${className}`}
        {...props}
      />
    );

    // Flush mode: bare element, no wrapper / label / footer block.
    if (isFlush) {
      return textareaEl;
    }

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block mb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-[var(--color-mid-gray)] [font-feature-settings:'case'_1]"
          >
            {label}
          </label>
        )}
        {textareaEl}
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
          {showCounter && (
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
