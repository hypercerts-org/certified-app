"use client";

import React from "react";
import { RadioGroup, Radio } from "./radio";
import Tooltip from "./tooltip";

/**
 * SegmentedControl + ToggleGroup — two related "segmented" primitives that
 * share one styling vocabulary.
 *
 * SegmentedControl (default export)
 * ---------------------------------
 *   Single-select. A THIN wrapper over the repo's RadioGroup (role=radiogroup,
 *   roving tabindex, arrow-key selection — all inherited, not reimplemented).
 *   Exactly one option is active at a time.
 *
 *     <SegmentedControl
 *       value={view}
 *       onValueChange={setView}
 *       aria-label="View"
 *       options={[
 *         { value: "list",    icon: <List size={14} />,       ariaLabel: "List view" },
 *         { value: "gallery", icon: <LayoutGrid size={14} />, ariaLabel: "Gallery view" },
 *       ]}
 *       size="md"
 *       joined
 *       shape="square"
 *       iconOnly
 *     />
 *
 * ToggleGroup (named export)
 * --------------------------
 *   Multi / independent select. role=group of buttons each carrying
 *   `aria-pressed`. Any non-empty subset (including the empty set) is valid;
 *   each option toggles on its own. Supports per-option semantic color tone
 *   (neutral / success / warn) for the active state — used by the
 *   accept (green) / reject (amber) response control.
 *
 *     <ToggleGroup
 *       value={selected}            // string[]
 *       onValueChange={setSelected}
 *       aria-label="Endorsement rings"
 *       options={[
 *         { value: "1", label: "1st" },
 *         { value: "2", label: "2nd" },
 *         { value: "3", label: "3rd" },
 *       ]}
 *       shape="pill"
 *       joined={false}
 *     />
 *
 * Shared geometry
 * ---------------
 *   - `joined` (default true): one shared outer border with `overflow-hidden`;
 *     each segment drops its own border (border:0) and a left divider separates
 *     adjacent segments. `joined={false}` gaps the segments and gives each its
 *     own border.
 *   - `shape`: "square" → rounded (= var(--radius), 2px); "pill" →
 *     rounded-[999px].
 *   - `size`: "sm" (h-7 / 28px) | "md" (h-8 / 32px).
 *   - Focus ring: drawn with a NEGATIVE outline-offset so it renders INSIDE the
 *     segment and is never clipped by the joined container's overflow-hidden.
 *     (A positive offset, as used elsewhere in the repo, would be clipped.)
 */

export interface SegmentOption {
  value: string;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Accessible name for icon-only segments (no visible text). */
  ariaLabel?: string;
  /** Optional hover/focus tooltip text for this segment. When set, the
   *  rendered segment is wrapped in <Tooltip> so the label appears on
   *  hover and keyboard focus (in addition to its `ariaLabel`). */
  tooltip?: string;
}

type Size = "sm" | "md";
type Shape = "square" | "pill";
type Tone = "neutral" | "success" | "warn";

/** Outer container geometry shared by both primitives. */
function containerClass(joined: boolean, shape: Shape): string {
  const radius = shape === "pill" ? "rounded-[999px]" : "rounded";
  // `self-center`: the strip has an intrinsic height (its segments) and must
  // NOT vertically stretch when it's a child of a flex toolbar whose other
  // items are taller (e.g. the explore chrome row, where `align-items` defaults
  // to `stretch`). Without this, the container stretches but the fixed-height
  // segments don't, leaving the active "square" floating in extra background.
  if (joined) {
    // One border for the whole strip; overflow-hidden clips segment corners to
    // the container radius. Inline-flex so it hugs its content.
    return `inline-flex items-stretch self-center overflow-hidden border border-[var(--border-default)] bg-[var(--bg-sunken)] ${radius}`;
  }
  // Gapped: no shared border/background; each segment is bordered on its own.
  return "inline-flex items-stretch self-center gap-1";
}

/** Per-segment geometry shared by both primitives. */
function segmentClass({
  joined,
  shape,
  size,
  iconOnly,
  isFirst,
}: {
  joined: boolean;
  shape: Shape;
  size: Size;
  iconOnly: boolean;
  isFirst: boolean;
}): string {
  const parts: string[] = [
    "relative inline-flex items-center justify-center gap-1.5 font-medium leading-none transition-colors duration-150 motion-reduce:transition-none",
    // Focus ring drawn INSIDE the box so the joined overflow-hidden can't clip
    // it. outline-offset is negative → the 2px outline sits within the segment.
    "focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:-outline-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-7 text-[13px]" : "h-8 text-sm",
    iconOnly
      ? size === "sm"
        ? "w-7 px-0"
        : "w-8 px-0"
      : size === "sm"
        ? "px-2.5"
        : "px-3",
  ];

  if (joined) {
    // No per-segment border; a left divider separates adjacent segments. The
    // container owns the outer border + radius.
    parts.push("border-0");
    if (!isFirst) parts.push("border-l border-[var(--border-default)]");
  } else {
    // Standalone bordered chip.
    parts.push("border border-[var(--border-default)] bg-[var(--bg-elevated)]");
    parts.push(shape === "pill" ? "rounded-[999px]" : "rounded");
  }

  return parts.join(" ");
}

// --------------------------------------------------------------------------
// SegmentedControl — single-select, role=radiogroup (wraps RadioGroup)
// --------------------------------------------------------------------------

export interface SegmentedControlProps {
  /** Currently-selected value. */
  value?: string;
  /** Fired with the new value on click or arrow-key selection. */
  onValueChange?: (value: string) => void;
  options: SegmentOption[];
  size?: Size;
  /** true (default) → shared border + dividers; false → gapped chips. */
  joined?: boolean;
  shape?: Shape;
  /** Hide labels and size segments as squares/circles for icon-only strips. */
  iconOnly?: boolean;
  /** Required: names the group for assistive tech. */
  "aria-label": string;
  className?: string;
}

const SegmentedControl = React.forwardRef<HTMLDivElement, SegmentedControlProps>(
  (
    {
      value,
      onValueChange,
      options,
      size = "md",
      joined = true,
      shape = "square",
      iconOnly = false,
      "aria-label": ariaLabel,
      className = "",
    },
    ref
  ) => {
    // RadioGroup is a plain function component (not forwardRef), so a `ref` can't
    // be threaded through it. To honor the SegmentedControl `ref` contract
    // (consumers measuring/scrolling the strip) we resolve the ref to the
    // radiogroup's root node after mount via a callback ref on a
    // `display:contents` wrapper — the wrapper produces no box of its own, so the
    // strip's layout/geometry is unchanged.
    const setWrapperRef = React.useCallback(
      (node: HTMLSpanElement | null) => {
        const target =
          (node?.querySelector('[role="radiogroup"]') as HTMLDivElement | null) ??
          null;
        if (typeof ref === "function") ref(target);
        else if (ref) ref.current = target;
      },
      [ref]
    );
    return (
      <span ref={setWrapperRef} style={{ display: "contents" }}>
      <RadioGroup
        value={value}
        onValueChange={onValueChange}
        aria-label={ariaLabel}
        className={`${containerClass(joined, shape)} ${className}`.trim()}
      >
        {options.map((opt, i) => {
          const selected = value === opt.value;
          const stateClass = selected
            ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)]"
            : "bg-transparent text-[var(--fg-muted)] hover:text-[var(--fg-primary)]";
          const radio = (
            <Radio
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
              aria-label={iconOnly || !opt.label ? opt.ariaLabel : undefined}
              className={`${segmentClass({
                joined,
                shape,
                size,
                iconOnly,
                isFirst: i === 0,
              })} ${stateClass}`}
            >
              {opt.icon ? (
                <span className="inline-flex items-center" aria-hidden="true">
                  {opt.icon}
                </span>
              ) : null}
              {!iconOnly && opt.label ? (
                <span className="leading-none">{opt.label}</span>
              ) : null}
            </Radio>
          );
          // Wrap in a tooltip when the option carries one. The Tooltip
          // span is itself the keyed child so React's reconciler still
          // sees one element per option.
          return opt.tooltip ? (
            <Tooltip key={opt.value} label={opt.tooltip}>
              {radio}
            </Tooltip>
          ) : (
            radio
          );
        })}
      </RadioGroup>
      </span>
    );
  }
);

SegmentedControl.displayName = "SegmentedControl";

// --------------------------------------------------------------------------
// ToggleGroup — multi-select, role=group of aria-pressed buttons
// --------------------------------------------------------------------------

/** Active-state classes per semantic tone. Tints flip in dark via the tokens. */
const TONE_ACTIVE: Record<Tone, string> = {
  neutral: "bg-[var(--bg-elevated)] text-[var(--fg-primary)]",
  success:
    "bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-[var(--color-success-text)]",
  warn:
    "bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] border-[var(--color-warning-border)]",
};

export interface ToggleGroupOption extends SegmentOption {
  /** Per-option override of the active-state color tone. Falls back to the
   *  group's `tone`. */
  tone?: Tone;
}

export interface ToggleGroupProps {
  /** The set of currently-pressed values. */
  value: string[];
  /** Fired with the full next set after a toggle. */
  onValueChange?: (value: string[]) => void;
  options: ToggleGroupOption[];
  /** Default active-state tone for all options (per-option `tone` overrides). */
  tone?: Tone;
  size?: Size;
  /** true (default) → shared border + dividers; false → gapped chips. */
  joined?: boolean;
  shape?: Shape;
  /** Hide labels and size segments as squares/circles for icon-only strips. */
  iconOnly?: boolean;
  /** Required: names the group for assistive tech. */
  "aria-label": string;
  className?: string;
}

export const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  (
    {
      value,
      onValueChange,
      options,
      tone = "neutral",
      size = "md",
      joined = true,
      shape = "square",
      iconOnly = false,
      "aria-label": ariaLabel,
      className = "",
    },
    ref
  ) => {
    const toggle = (optValue: string) => {
      const set = new Set(value);
      if (set.has(optValue)) set.delete(optValue);
      else set.add(optValue);
      // Preserve option order rather than insertion order so the emitted set is
      // stable regardless of click sequence.
      onValueChange?.(options.map((o) => o.value).filter((v) => set.has(v)));
    };

    return (
      <div
        ref={ref}
        role="group"
        aria-label={ariaLabel}
        className={`${containerClass(joined, shape)} ${className}`.trim()}
      >
        {options.map((opt, i) => {
          const pressed = value.includes(opt.value);
          const optTone = opt.tone ?? tone;
          const stateClass = pressed
            ? TONE_ACTIVE[optTone]
            : "bg-transparent text-[var(--fg-muted)] hover:text-[var(--fg-primary)]";
          const button = (
            <button
              key={opt.value}
              type="button"
              aria-pressed={pressed}
              aria-label={iconOnly || !opt.label ? opt.ariaLabel : undefined}
              disabled={opt.disabled}
              onClick={() => toggle(opt.value)}
              className={`${segmentClass({
                joined,
                shape,
                size,
                iconOnly,
                isFirst: i === 0,
              })} ${stateClass}`}
            >
              {opt.icon ? (
                <span className="inline-flex items-center" aria-hidden="true">
                  {opt.icon}
                </span>
              ) : null}
              {!iconOnly && opt.label ? (
                <span className="leading-none">{opt.label}</span>
              ) : null}
            </button>
          );
          return opt.tooltip ? (
            <Tooltip key={opt.value} label={opt.tooltip}>
              {button}
            </Tooltip>
          ) : (
            button
          );
        })}
      </div>
    );
  }
);

ToggleGroup.displayName = "ToggleGroup";

export default SegmentedControl;
