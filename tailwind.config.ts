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
      fontSize: {
        display: [
          "3rem",
          { lineHeight: "1.1", fontWeight: "700", letterSpacing: "-0.03em" },
        ],
        h1: [
          "2.25rem",
          { lineHeight: "1.2", fontWeight: "700", letterSpacing: "-0.02em" },
        ],
        h2: [
          "1.75rem",
          { lineHeight: "1.3", fontWeight: "600", letterSpacing: "-0.01em" },
        ],
        h3: ["1.375rem", { lineHeight: "1.4", fontWeight: "600" }],
        h4: ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["1rem", { lineHeight: "1.6", fontWeight: "400" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],
        caption: [
          "0.75rem",
          { lineHeight: "1.4", fontWeight: "500", letterSpacing: "0.05em" },
        ],
      },
      boxShadow: {
        /* Shadows are defined as CSS custom properties (--shadow-sm/md/lg).
           These Tailwind utilities exist only for one-off cases. */
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
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
