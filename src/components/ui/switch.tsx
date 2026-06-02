"use client";

import React, { useId } from "react";

export interface SwitchProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "onChange" | "type" | "value"
  > {
  /** Controlled on/off state. */
  checked: boolean;
  /** Fired with the next state when the user toggles. */
  onCheckedChange?: (checked: boolean) => void;
  /** Visible label rendered to the right and associated via the control id. */
  label?: React.ReactNode;
}

/**
 * Toggle switch implementing the ARIA `switch` pattern on a real `<button>`
 * (native Space/Enter activation comes for free; we forward clicks to
 * onCheckedChange). The track recolors and the thumb slides on toggle; the
 * slide respects prefers-reduced-motion.
 *
 * Controlled only — pass `checked` + `onCheckedChange`.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked,
      onCheckedChange,
      label,
      disabled,
      className = "",
      id,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const switchId = id || autoId;
    const labelId = label ? `${switchId}-label` : undefined;

    const control = (
      <button
        ref={ref}
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? labelId : undefined}
        aria-label={!label ? ariaLabel : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-[999px] border border-transparent transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked
            ? "bg-[var(--btn-primary-bg)]"
            : "bg-[var(--border-hover)]"
        } ${className}`}
        {...props}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-[var(--bg-elevated)] shadow-sm transition-transform duration-150 motion-reduce:transition-none ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    );

    if (!label) return control;

    return (
      <div className="inline-flex items-center gap-2">
        {control}
        <label
          id={labelId}
          htmlFor={switchId}
          className={`text-sm text-[var(--fg-primary)] ${
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          }`}
        >
          {label}
        </label>
      </div>
    );
  }
);

Switch.displayName = "Switch";

export default Switch;
