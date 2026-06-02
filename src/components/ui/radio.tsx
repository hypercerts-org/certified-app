"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

/**
 * RadioGroup + Radio — WAI-ARIA radiogroup pattern.
 *
 * API
 * ---
 *   <RadioGroup value={v} onValueChange={setV} aria-label="…">
 *     <Radio value="a">Label A</Radio>
 *     <Radio value="b">Label B</Radio>
 *   </RadioGroup>
 *
 * - Controlled only: pass `value` + `onValueChange`. (Matches how Tabs in this
 *   repo is driven and how ThemeToggle drives its segmented control — a single
 *   source of truth lives in the parent.)
 * - Roving tabindex: exactly one Radio is tabbable. Tab moves into the group
 *   onto the checked option (or the first enabled option if none is checked);
 *   Tab again leaves the group.
 * - Arrow keys move selection AND focus to the next/previous enabled option,
 *   wrapping at the ends. Left/Up go previous; Right/Down go next. Home/End jump
 *   to the first/last enabled option. Selecting via arrow also fires
 *   onValueChange (per the ARIA pattern for radios).
 * - `orientation` only affects which arrow keys are documented as primary; both
 *   axes work, matching common implementations.
 * - Disabled options are skipped by keyboard navigation and are not selectable.
 *
 * This component also serves as the SegmentedControl base: render Radios with
 * custom children (icon + label) and style the group/options with `className`.
 *
 * Registered options (value + disabled, in DOM order) are tracked in React
 * state — never read from refs during render — so the roving-tabindex target
 * stays reactive. Option DOM nodes are kept in a ref purely for `.focus()`
 * calls inside event handlers.
 */

type Registered = { value: string; disabled: boolean };

type RadioGroupContextValue = {
  name: string;
  value: string | undefined;
  groupDisabled: boolean;
  onSelect: (value: string) => void;
  /** Track an option's DOM node for focus management (event handlers only). */
  setNode: (value: string, node: HTMLButtonElement | null) => void;
  /** Register an option's membership + disabled state (called from an effect). */
  registerItem: (value: string, disabled: boolean) => void;
  /** Remove an option on unmount. */
  unregisterItem: (value: string) => void;
  focusRelative: (fromValue: string, dir: -1 | 1 | "first" | "last") => void;
  /** The value that should currently be tabbable (roving tabindex). */
  tabbableValue: string | undefined;
};

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Currently-selected value. */
  value?: string;
  /** Fired with the new value on click or arrow-key selection. */
  onValueChange?: (value: string) => void;
  /** Shared `name` for the conceptual group (also used for stable ids). */
  name?: string;
  /** Disables every option in the group. */
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  children?: React.ReactNode;
}

export function RadioGroup({
  value,
  onValueChange,
  name,
  disabled = false,
  orientation = "horizontal",
  className = "",
  children,
  ...props
}: RadioGroupProps) {
  const autoName = useId();
  const groupName = name || autoName;

  // DOM nodes for focus() (mutated outside render); membership/order/disabled
  // live in state so the tabbable target can be computed without ref reads.
  const nodesRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [items, setItems] = useState<Registered[]>([]);

  const setNode = useCallback((val: string, node: HTMLButtonElement | null) => {
    if (node) nodesRef.current.set(val, node);
    else nodesRef.current.delete(val);
  }, []);

  const registerItem = useCallback((val: string, isDisabled: boolean) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.value === val);
      if (idx === -1) return [...prev, { value: val, disabled: isDisabled }];
      if (prev[idx].disabled === isDisabled) return prev;
      const next = prev.slice();
      next[idx] = { value: val, disabled: isDisabled };
      return next;
    });
  }, []);

  const unregisterItem = useCallback((val: string) => {
    setItems((prev) => prev.filter((i) => i.value !== val));
  }, []);

  const onSelect = useCallback(
    (val: string) => {
      if (disabled) return;
      if (val !== value) onValueChange?.(val);
    },
    [disabled, value, onValueChange]
  );

  const focusRelative = useCallback(
    (fromValue: string, dir: -1 | 1 | "first" | "last") => {
      const enabled = items.filter((i) => !i.disabled).map((i) => i.value);
      if (enabled.length === 0) return;

      let nextVal: string | undefined;
      if (dir === "first") {
        nextVal = enabled[0];
      } else if (dir === "last") {
        nextVal = enabled[enabled.length - 1];
      } else {
        const idx = enabled.indexOf(fromValue);
        const base = idx === -1 ? 0 : idx;
        nextVal = enabled[(base + dir + enabled.length) % enabled.length];
      }
      if (nextVal == null) return;

      nodesRef.current.get(nextVal)?.focus();
      // Per ARIA, moving with arrows also checks the newly-focused radio.
      onSelect(nextVal);
    },
    [items, onSelect]
  );

  // Roving tabindex target: the checked option, else the first enabled option.
  const firstEnabled = items.find((i) => !i.disabled)?.value;
  const tabbableValue =
    value && items.some((i) => i.value === value) ? value : firstEnabled;

  return (
    <RadioGroupContext.Provider
      value={{
        name: groupName,
        value,
        groupDisabled: disabled,
        onSelect,
        setNode,
        registerItem,
        unregisterItem,
        focusRelative,
        tabbableValue,
      }}
    >
      <div
        role="radiogroup"
        aria-orientation={orientation}
        className={className}
        {...props}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface RadioProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "value" | "onChange" | "type"
  > {
  value: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

export const Radio = React.forwardRef<HTMLButtonElement, RadioProps>(
  ({ value, disabled, className = "", children, ...props }, ref) => {
    const ctx = useContext(RadioGroupContext);
    if (!ctx) {
      throw new Error("Radio must be rendered inside a RadioGroup");
    }
    const {
      onSelect,
      setNode,
      registerItem,
      unregisterItem,
      focusRelative,
      tabbableValue,
      groupDisabled,
    } = ctx;

    const isDisabled = disabled || groupDisabled;
    const isChecked = ctx.value === value;
    const isTabbable = tabbableValue === value;

    // Membership + disabled tracking. Toggling `disabled` at runtime re-appends
    // the option to the end of keyboard order; acceptable since radio options
    // are effectively static in every call site.
    useEffect(() => {
      registerItem(value, isDisabled);
      return () => unregisterItem(value);
    }, [value, isDisabled, registerItem, unregisterItem]);

    const setRefs = (node: HTMLButtonElement | null) => {
      setNode(value, node);
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (isDisabled) return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          focusRelative(value, 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          focusRelative(value, -1);
          break;
        case "Home":
          e.preventDefault();
          focusRelative(value, "first");
          break;
        case "End":
          e.preventDefault();
          focusRelative(value, "last");
          break;
        // Space selects the focused radio (Enter is left to native button
        // behavior, which also triggers onClick).
        case " ":
          e.preventDefault();
          onSelect(value);
          break;
        default:
          break;
      }
    };

    return (
      <button
        ref={setRefs}
        type="button"
        role="radio"
        aria-checked={isChecked}
        aria-disabled={isDisabled || undefined}
        disabled={isDisabled}
        tabIndex={isTabbable ? 0 : -1}
        onClick={() => onSelect(value)}
        onKeyDown={onKeyDown}
        className={`inline-flex items-center gap-2 rounded text-sm text-[var(--fg-primary)] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Radio.displayName = "Radio";

export default RadioGroup;
