"use client";

import { ThemeToggle } from "@hypercerts-org/ui-react";
import { useEffect, useState } from "react";
import { parseThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

function applyThemeMode(mode: ThemeMode) {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.setAttribute("data-hc-mode", "dark");
  else document.documentElement.removeAttribute("data-hc-mode");
}

function readStoredMode(): ThemeMode {
  try {
    return parseThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** Keeps `data-hc-mode` in sync with OS changes and other tabs while on "system". */
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyThemeMode(readStoredMode());
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return null;
}

/** Light / dark / system radio group using the Hypercerts UI toolkit's ThemeToggle. */
export function ThemeModeControl() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    setMode(readStoredMode());
  }, []);

  const handleChange = (next: ThemeMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked; still apply for this tab.
    }
    applyThemeMode(next);
  };

  return <ThemeToggle value={mode} onChange={handleChange} supportsDark />;
}
