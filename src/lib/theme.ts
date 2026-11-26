// Theme mode persistence (light | dark | system) for the Certified theme's
// `data-hc-mode="dark"` attribute from `@hypercerts-org/ui-react`. Server-safe
// so `src/app/layout.tsx` can inline `THEME_INIT_SCRIPT` without pulling a
// client chunk into the root shell.

export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "certified-theme-mode";

/** Runs synchronously before first paint to prevent a light/dark flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var dark=m==="dark"||((!m||m==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(dark)document.documentElement.setAttribute("data-hc-mode","dark");else document.documentElement.removeAttribute("data-hc-mode");}catch(e){}})();`;

export function parseThemeMode(raw: string | null): ThemeMode {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}
