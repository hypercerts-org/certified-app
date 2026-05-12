"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

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
  /** "segmented" (default) is the full 3-state radio group.
   *  "cycle" is a single icon button that cycles system → light → dark on click. */
  variant?: "segmented" | "cycle";
  /** Compact hides labels on the segmented variant. Ignored for "cycle". */
  compact?: boolean;
  className?: string;
}

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
      <button
        type="button"
        className={`theme-toggle-cycle ${className}`}
        onClick={() => setTheme(next)}
        aria-label={label}
        title={label}
      >
        <span className="theme-toggle-cycle__icon" aria-hidden="true">
          {activeIcon}
        </span>
      </button>
    );
  }

  return (
    <div
      className={`theme-toggle ${compact ? "theme-toggle--compact" : ""} ${className}`}
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((opt) => {
        const selected = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`theme-toggle__option ${selected ? "theme-toggle__option--selected" : ""}`}
            onClick={() => setTheme(opt.value)}
          >
            <span className="theme-toggle__icon" aria-hidden="true">
              {opt.icon}
            </span>
            {!compact && <span className="theme-toggle__label">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
