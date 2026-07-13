import React, { useEffect, useId, useRef } from "react";
import { Check, Minus } from "lucide-react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Visible label rendered to the right of the box and associated via htmlFor. */
  label?: React.ReactNode;
  /** Tri-state: when true, renders a dash and sets the DOM `indeterminate` flag. */
  indeterminate?: boolean;
  /** Inline error message; also tints the box with the error-surface tokens. */
  error?: string;
}

/**
 * Accessible checkbox built on a visually-hidden native `<input type="checkbox">`
 * (kept in the a11y tree for keyboard + form semantics) plus a custom box drawn
 * with semantic tokens. We deliberately do NOT use `accent-color`: it can't be
 * themed per-token and renders inconsistently across browsers. The check / dash
 * glyphs come from lucide and are shown via peer-state utilities.
 *
 * `indeterminate` is a DOM-only property (no HTML attribute), so it's applied
 * through a ref effect.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      indeterminate = false,
      error,
      className = "",
      id,
      disabled,
      checked,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const inputId = id || autoId;
    const errorId = error ? `${inputId}-error` : undefined;

    const innerRef = useRef<HTMLInputElement | null>(null);

    // Merge the forwarded ref with our local ref so both the consumer and the
    // indeterminate effect can reach the node.
    const setRefs = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    const boxBorder = error
      ? "border-[var(--color-error-border)]"
      : "border-[var(--border-hover)]";

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-4 w-4 shrink-0">
            <input
              ref={setRefs}
              id={inputId}
              type="checkbox"
              checked={checked}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={errorId}
              // The native input is the real control: it stays in the a11y tree
              // and stacks above the box so clicks/keyboard hit it. `peer` lets
              // the box react to its :checked / :focus-visible / :disabled state.
              className="peer absolute inset-0 z-[var(--z-local-raise)] m-0 h-4 w-4 cursor-pointer appearance-none rounded opacity-0 disabled:cursor-not-allowed"
              {...props}
            />
            <span
              aria-hidden="true"
              className={`pointer-events-none flex h-4 w-4 items-center justify-center rounded border bg-[var(--bg-elevated)] ${boxBorder} text-transparent transition-colors duration-150 motion-reduce:transition-none peer-checked:border-[var(--btn-primary-bg)] peer-checked:bg-[var(--btn-primary-bg)] peer-checked:text-[var(--btn-primary-fg)] peer-indeterminate:border-[var(--btn-primary-bg)] peer-indeterminate:bg-[var(--btn-primary-bg)] peer-indeterminate:text-[var(--btn-primary-fg)] peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus-ring)] peer-focus-visible:outline-offset-2 peer-disabled:opacity-50`}
            >
              {/* Both glyphs inherit the box's `color`, which is transparent
                  until the input is :checked / :indeterminate — so the glyph is
                  only visible in those states. We render Minus when
                  indeterminate, Check otherwise. */}
              {indeterminate ? (
                <Minus className="h-3 w-3" strokeWidth={3} />
              ) : (
                <Check className="h-3 w-3" strokeWidth={3} />
              )}
            </span>
          </span>
          {label && (
            <label
              htmlFor={inputId}
              className={`text-sm text-[var(--fg-primary)] ${
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              }`}
            >
              {label}
            </label>
          )}
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-error">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";

export default Checkbox;
