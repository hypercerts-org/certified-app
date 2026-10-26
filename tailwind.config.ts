import type { Config } from "tailwindcss";

export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  /* `hover:` utilities only apply on devices that can hover, so a tap on a
     touch screen doesn't leave the hover style stuck on. */
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    /* Breakpoints are the design system's canonical set ONLY (DESIGN.md /
       CLAUDE.md hard rule): 800 / 1100 / 1300. Defining `screens` here
       (not under `extend`) REPLACES Tailwind's defaults (640/768/1024/…),
       so a stray `md:`/`lg:` utility can never resolve to a non-canonical
       breakpoint. `md` = the "gt-mobile" 800px threshold — this is why
       `md:text-sm` on inputs now flips at 800px (16px below it → no iOS
       auto-zoom on focus), instead of Tailwind's old 768px default. */
    screens: {
      md: "800px",
      lg: "1100px",
      xl: "1300px",
    },
    extend: {
      colors: {
        /* Semantic status colors — used sparingly via Tailwind utilities.
           Pointed at the theme-aware tokens in tokens.css so `text-error`
           etc. match CSS-styled status text and flip in dark mode. */
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        error: "var(--color-error)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        headline: ["var(--font-headline)", "Noto Serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      /* Canonical type ramp (DESIGN.md §3). Size, leading, tracking and
         weight travel together; sizes outside this table are not allowed
         in new code. Serif steps pair with `font-headline`. Noto Serif
         loads 300 / 400 / 600 / 700 (layout.tsx), so h2-h4 render at the
         specced 600. `label` is uppercase-only: tokens.css adds the
         transform + 'case' forms to `.text-label`. Mirrored as
         --text-* size tokens in tokens.css for CSS consumers. */
      fontSize: {
        display: [
          "3rem",
          { lineHeight: "1.1", fontWeight: "700", letterSpacing: "-0.03em" },
        ],
        h1: [
          "2.25rem",
          { lineHeight: "1.15", fontWeight: "700", letterSpacing: "-0.02em" },
        ],
        h2: [
          "1.75rem",
          { lineHeight: "1.2", fontWeight: "600", letterSpacing: "-0.015em" },
        ],
        h3: [
          "1.375rem",
          { lineHeight: "1.3", fontWeight: "600", letterSpacing: "-0.01em" },
        ],
        h4: [
          "1.125rem",
          { lineHeight: "1.35", fontWeight: "600", letterSpacing: "-0.005em" },
        ],
        body: ["1rem", { lineHeight: "1.6", fontWeight: "400" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],
        ui: ["0.8125rem", { lineHeight: "1.45" }],
        caption: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.01em" }],
        label: [
          "0.6875rem",
          { lineHeight: "1.2", fontWeight: "600", letterSpacing: "0.06em" },
        ],
        micro: ["0.625rem", { lineHeight: "1", fontWeight: "500", letterSpacing: "0.02em" }],
      },
      letterSpacing: {
        /* The one positive tracking value, for uppercase text only. */
        label: "var(--tracking-label)",
      },
      /* Motion tokens (tokens.css). Bare `transition-*` utilities default
         to the fast duration on the house curve. */
      transitionDuration: {
        DEFAULT: "var(--duration-fast)",
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        DEFAULT: "var(--ease-out)",
        out: "var(--ease-out)",
        emphasized: "var(--ease-emphasized)",
        "in-out": "var(--ease-in-out)",
      },
      /* Control-height scale: 32 compact (desktop only) / 36 sm /
         44 md (every control's minimum below 800px) / 56 lg. */
      height: {
        "control-compact": "var(--control-h-compact)",
        "control-sm": "var(--control-h-sm)",
        "control-md": "var(--control-h-md)",
        "control-lg": "var(--control-h-lg)",
      },
      minHeight: {
        "control-compact": "var(--control-h-compact)",
        "control-sm": "var(--control-h-sm)",
        "control-md": "var(--control-h-md)",
        "control-lg": "var(--control-h-lg)",
      },
      maxWidth: {
        measure: "var(--measure)",
      },
      boxShadow: {
        /* Shadows are defined as CSS custom properties (--shadow-sm/md/lg).
           These Tailwind utilities exist only for one-off cases. */
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        modal: "var(--shadow-modal)",
      },
      borderRadius: {
        DEFAULT: "2px",
      },
      /* One pulse recipe app-wide (DESIGN.md): opacity 1 -> .5 -> 1 over
         1.5s. `animate-skeleton` is what <Skeleton> uses: it stays
         invisible for 200ms, fades in over 150ms, then pulses — so a
         sub-200ms load never flashes a placeholder. `.map-skeleton` in
         feed.css repeats the same value. */
      keyframes: {
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: ".5" },
        },
        "skeleton-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        pulse: "pulse 1.5s ease-in-out infinite",
        skeleton:
          "skeleton-in 150ms ease-out 200ms both, pulse 1.5s ease-in-out 350ms infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
