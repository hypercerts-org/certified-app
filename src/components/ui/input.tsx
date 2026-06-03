import React, { useId } from "react";

export type InputSize = "sm" | "md" | "lg" | "bare";
export type InputVariant = "default" | "underline" | "inline-edit";
/**
 * Resting + focus border treatment for the `default` variant. Two
 * holdout-driven families coexist:
 *   - `default` (1 px `--border-default`) — the app's standard field
 *     weight; also what the sidebar org-URL / founded-date inputs use.
 *   - `hover`   (1.5 px `--border-hover`) — the slightly heavier
 *     "currently editable" weight the inline-edit holdouts use (profile
 *     name / website, cert title / meta / short-description). Focus on
 *     this family resolves the border to `--fg-primary` with a 2 px
 *     `--overlay-weak` ring, matching the legacy `*-input:focus` CSS
 *     rather than the accent focus-ring the standard field uses.
 * Only consulted for the `default` variant — `underline` / `inline-edit`
 * own their own border treatment and ignore this.
 */
export type InputBorderWeight = "default" | "hover";
/**
 * Typographic density. `default` keeps today's per-size padding + text
 * scale; `compact` is the cert-detail "meta" scale (0.8125rem text,
 * 2px/6px padding) shared by the activity meta-input holdouts. Compact
 * only changes padding + text-size, so it composes with any size; with
 * `size="bare"` it sets just the padding (text-size cascades).
 */
export type InputDensity = "default" | "compact";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: InputSize;
  variant?: InputVariant;
  /**
   * Border treatment for the `default` variant — see
   * {@link InputBorderWeight}. Defaults to `default` (1 px). Pass
   * `"hover"` for the heavier 1.5 px "editable" weight the profile /
   * cert inline-edit holdouts use. Ignored by the `underline` and
   * `inline-edit` variants.
   */
  borderWeight?: InputBorderWeight;
  /**
   * Typographic density — see {@link InputDensity}. Defaults to
   * `default`. `compact` is the cert-detail meta scale.
   */
  density?: InputDensity;
  /**
   * Unwrapped / "flush" mode. When true the component renders the bare
   * `<input>` (plus the relative icon wrapper only if icons are used)
   * with NO outer `w-full` wrapper `<div>` and NO label / error /
   * helper block — so the field can sit directly as a flex or grid
   * child (the inline icon+input rows, the cert meta inputs). `label`,
   * `error`, and `helperText` are ignored in this mode (a flush field
   * is labelled by its parent row). `aria-invalid` still reflects
   * `error` so assistive tech and styling hooks keep working.
   * Alias: `unwrapped`.
   */
  flush?: boolean;
  /** Alias for {@link flush}. */
  unwrapped?: boolean;
  /**
   * Optional addon glyph rendered inside the field, before the text. The
   * wrapper positions it and the input is padded so text never overlaps it.
   * A bare <Input> with no icons renders exactly as before (no wrapper cost).
   */
  leadingIcon?: React.ReactNode;
  /** Optional decorative addon glyph rendered inside the field, after the text. */
  trailingIcon?: React.ReactNode;
  /**
   * Optional INTERACTIVE element rendered at the trailing edge inside the field
   * (e.g. a combobox clear/submit button). Unlike `trailingIcon` it is NOT
   * decorative: it keeps pointer events and is not aria-hidden, so callers can
   * pass a real `<button>`. Pass a fully-formed interactive node (it should be
   * focusable and carry its own `aria-label`). When both `trailingIcon` and
   * `trailingButton` are supplied, `trailingButton` wins the trailing slot and
   * the decorative icon is not rendered. The input picks up the same trailing
   * padding as `trailingIcon` so text never overlaps the control.
   */
  trailingButton?: React.ReactNode;
}

const sizeClasses: Record<InputSize, string> = {
  // 36 / 44 / 56 — Tailwind's h-9 / h-11 / h-14.
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base md:text-sm",
  lg: "h-14 px-5 text-base",
  // No fixed height, no text-size — typography cascades from the parent
  // (e.g. an H1 serif scale via `font:inherit`, or the create-form's
  // 1.375rem title rule). We still set the horizontal padding the
  // wrapped sizes carry so a bare field isn't edge-to-edge; the
  // `font-[inherit]` trio makes size/leading inherit the cascade.
  bare: "px-3 font-[inherit] text-[length:inherit] leading-[inherit]",
};

// Compact density: the cert-detail "meta" scale (0.8125rem text,
// 2px vertical / 6px horizontal padding). Overrides the size's own
// padding + text scale. With `size="bare"` the text-size half is a
// no-op because bare already inherits length — the padding still
// applies, which is what the meta inputs want (2px/6px on inherited
// typography).
const compactClasses = "py-0.5 px-1.5 text-[0.8125rem]";

// Horizontal padding the input picks up when an icon occupies that side, so
// the caret/text clears the glyph. Mirrors sizeClasses' base px per size.
const leadingPadClasses: Record<InputSize, string> = {
  sm: "pl-9",
  md: "pl-11",
  lg: "pl-12",
  bare: "pl-9",
};
const trailingPadClasses: Record<InputSize, string> = {
  sm: "pr-9",
  md: "pr-11",
  lg: "pr-12",
  bare: "pr-9",
};

// Where the absolutely-positioned icon sits, per side and size.
const leadingIconPos: Record<InputSize, string> = {
  sm: "left-3",
  md: "left-4",
  lg: "left-5",
  bare: "left-3",
};
const trailingIconPos: Record<InputSize, string> = {
  sm: "right-3",
  md: "right-4",
  lg: "right-5",
  bare: "right-3",
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      size = "md",
      variant = "default",
      borderWeight = "default",
      density = "default",
      flush = false,
      unwrapped = false,
      className = "",
      leadingIcon,
      trailingIcon,
      trailingButton,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const inputId = id || autoId;
    const isFlush = flush || unwrapped;
    // Label / error / helper only render in the wrapped layout. In flush
    // mode the parent row owns the labelling, so we skip generating the
    // describedby ids entirely (nothing renders them) — but keep
    // aria-invalid wired to `error` so AT + invalid styling still work.
    const errorId = !isFlush && error ? `${inputId}-error` : undefined;
    const helperId =
      !isFlush && !error && helperText ? `${inputId}-helper` : undefined;
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
          // Two resting/focus families, chosen by `borderWeight`. The
          // `hover` family reproduces the inline-edit holdout chrome:
          // 1.5px --border-hover at rest, resolving to --fg-primary + a
          // 2px --overlay-weak ring on focus (NOT the accent focus-ring
          // the standard field uses). The `default` family is today's
          // 1px standard field, unchanged.
          if (error) {
            // `border` (1px) for default weight — byte-identical to the
            // pre-enhancement string; `border-[1.5px]` for hover weight.
            return borderWeight === "hover"
              ? "border-[1.5px] border-[var(--color-error-border)] rounded focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]/20"
              : "border border-[var(--color-error-border)] rounded focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]/20";
          }
          if (borderWeight === "hover") {
            return "border-[1.5px] border-[var(--border-hover)] rounded focus:border-[var(--fg-primary)] focus:ring-2 focus:ring-[var(--overlay-weak)]";
          }
          return "border border-[var(--border-default)] rounded focus:border-[var(--focus-ring)] focus:ring-1 focus:ring-[var(--focus-ring)]/20";
      }
    })();

    // The interactive trailing button takes priority over the decorative icon
    // for the trailing slot; only one occupies it at a time.
    const showTrailingButton = Boolean(trailingButton);
    const showTrailingIcon = Boolean(trailingIcon) && !showTrailingButton;
    const hasTrailingAddon = showTrailingButton || showTrailingIcon;

    const iconPad = `${leadingIcon ? leadingPadClasses[size] : ""} ${
      hasTrailingAddon ? trailingPadClasses[size] : ""
    }`;

    // Density overrides the size's own padding/text scale. It's appended
    // AFTER sizeClasses so its `px-*` / `py-*` / `text-*` win the cascade.
    const densityClasses = density === "compact" ? compactClasses : "";

    const inputEl = (
      <input
        ref={ref}
        id={inputId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${sizeClasses[size]} ${densityClasses} ${iconPad} ${baseChrome} ${variantChrome} ${disabledChrome} ${className}`}
        {...props}
      />
    );

    // Only pay for the relative wrapper + absolute addons when one exists.
    // This wrapper is the ONLY structural cost even in flush mode — the
    // outer `w-full` div + label/error block below is what flush drops.
    const field =
      leadingIcon || hasTrailingAddon ? (
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
          {showTrailingButton ? (
            // Interactive slot: keeps pointer events, NOT aria-hidden. The caller
            // supplies a focusable control (e.g. a clear/submit <button> with its
            // own aria-label) that a combobox can wire up.
            <span
              className={`absolute top-1/2 -translate-y-1/2 ${trailingIconPos[size]} flex items-center`}
            >
              {trailingButton}
            </span>
          ) : (
            showTrailingIcon && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${trailingIconPos[size]} flex items-center text-[var(--fg-muted)]`}
              >
                {trailingIcon}
              </span>
            )
          )}
        </div>
      ) : (
        inputEl
      );

    // Flush mode: return the field directly with no wrapper / label /
    // helper / error block, so it composes as a plain flex/grid child.
    if (isFlush) {
      return field;
    }

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
