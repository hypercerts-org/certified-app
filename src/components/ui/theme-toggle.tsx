"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { RadioGroup, Radio } from "./radio";
import Tooltip from "./tooltip";

type ThemeValue = "light" | "dark" | "system";

type ThemeOption = {
  value: ThemeValue;
  label: string;
  icon: React.ReactNode;
};

const OPTIONS: ThemeOption[] = [
  { value: "light", label: "Light", icon: <Sun size={14} /> },
  { value: "dark", label: "Dark", icon: <Moon size={14} /> },
  { value: "system", label: "System", icon: <Monitor size={14} /> },
];

/** Cycle order when clicking the single-icon variant. */
const CYCLE: ThemeValue[] = ["system", "light", "dark"];

export interface ThemeToggleProps {
  /** "segmented" (default) is the horizontal 3-segment track.
   *  "cards" is three distinct option buttons (icon over label), suited to a
   *  settings page. "cycle" is a single icon button that cycles
   *  system → light → dark on click. */
  variant?: "segmented" | "cards" | "cycle";
  /** Compact hides labels on the segmented variant. Ignored otherwise. */
  compact?: boolean;
  className?: string;
}

/** Larger icons for the card variant (the row/segment icons are size 14). */
const CARD_ICONS: Record<ThemeValue, React.ReactNode> = {
  light: <Sun size={20} />,
  dark: <Moon size={20} />,
  system: <Monitor size={20} />,
};

/**
 * Theme selector backed by next-themes.
 *
 * "segmented" renders a three-way radio group (Light / Dark / System).
 * "cycle" renders a single icon button showing the current theme; clicking
 * cycles through System → Light → Dark → System. The icon reflects the
 * current selection (Monitor / Sun / Moon), not the next state — following
 * the pattern used by Tailwind, Next.js, Vercel, and Radix docs.
 */
export default function ThemeToggle({
  variant = "segmented",
  compact = false,
  className = "",
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted ? (theme as ThemeValue | undefined) : undefined;

  if (variant === "cycle") {
    // Default icon while un-mounted (matches system default to avoid flicker)
    const activeIcon =
      current === "light" ? (
        <Sun size={18} />
      ) : current === "dark" ? (
        <Moon size={18} />
      ) : (
        <Monitor size={18} />
      );

    const next =
      current === undefined
        ? "light"
        : CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];

    const label = mounted
      ? `Theme: ${current === "system" ? "System" : current === "dark" ? "Dark" : "Light"}. Click to switch to ${
          next === "system" ? "System" : next === "dark" ? "Dark" : "Light"
        }.`
      : "Theme";

    return (
      <Tooltip label={label}>
        <button
          type="button"
          className={`theme-toggle-cycle ${className}`}
          onClick={() => setTheme(next)}
          aria-label={label}
        >
          <span className="theme-toggle-cycle__icon" aria-hidden="true">
            {activeIcon}
          </span>
        </button>
      </Tooltip>
    );
  }

  // Three distinct option buttons (icon over label). Each card is its own
  // bordered button; the selected one carries an fg-primary border + elevated
  // fill. Left-aligned, wraps on narrow widths.
  if (variant === "cards") {
    return (
      <RadioGroup
        value={current}
        onValueChange={(v) => setTheme(v)}
        aria-label="Theme"
        className={`flex flex-wrap gap-2 ${className}`.trim()}
      >
        {OPTIONS.map((opt) => {
          const selected = current === opt.value;
          const cardClassName = [
            "flex-col justify-center gap-2 rounded border px-5 py-4 min-w-[96px] font-medium text-[13px]",
            selected
              ? "border-[var(--fg-primary)] bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]"
              : "border-[var(--border-default)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:border-[var(--fg-muted)]",
          ].join(" ");

          return (
            <Radio key={opt.value} value={opt.value} className={cardClassName}>
              <span className="inline-flex items-center" aria-hidden="true">
                {CARD_ICONS[opt.value]}
              </span>
              <span className="leading-none">{opt.label}</span>
            </Radio>
          );
        })}
      </RadioGroup>
    );
  }

  // Segmented (default): a sunken, bordered track holding the three options.
  // `compact` drops the max-width + labels so it hugs its content (former
  // `.theme-toggle--compact`).
  const groupClassName = [
    "inline-flex items-stretch gap-0.5 rounded border border-[var(--border-default)] bg-[var(--bg-sunken)] p-[3px]",
    compact ? "w-auto" : "w-full max-w-[360px]",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <RadioGroup
      value={current}
      onValueChange={(v) => setTheme(v)}
      aria-label="Theme"
      className={groupClassName}
    >
      {OPTIONS.map((opt) => {
        const selected = current === opt.value;
        const optionClassName = [
          "flex-1 justify-center font-medium text-[13px]",
          compact ? "px-2.5 py-1.5" : "px-3 py-2",
          selected
            ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]"
            : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]",
        ].join(" ");

        return (
          <Radio key={opt.value} value={opt.value} className={optionClassName}>
            <span className="inline-flex items-center" aria-hidden="true">
              {opt.icon}
            </span>
            {!compact && <span className="leading-none">{opt.label}</span>}
          </Radio>
        );
      })}
    </RadioGroup>
  );
}
