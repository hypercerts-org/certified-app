import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Editorial palette (parchment + vermillion)
        navy: "#141413",        // dark warm ink (was navy)
        accent: "#c2392c",      // editorial vermillion (was electric blue)
        sky: "#f7e8e3",         // soft red tint (was light blue)
        deep: "#2a2622",        // body text
        cream: "#f6f1e8",       // page surface
        parchment: "#ece5d8",   // tonal step
        brand: "#c2392c",
        "brand-soft": "#f7e8e3",
        gray: {
          50: "#fcfaf6",
          100: "#ece5d8",
          200: "#e1d8c8",
          400: "#a8a092",
          600: "#6a6258",
          700: "#3b3733",
        },
        success: "#2ECC71",
        warning: "#F5A623",
        error: "#c2392c",
      },
      fontFamily: {
        // atproto.com-aligned: Plex Sans for body, Plex Mono for display.
        // The CSS variables come from next/font/google in src/app/layout.tsx.
        sans: [
          "var(--font-inter)",
          "IBM Plex Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        serif: [
          // "serif" is retained as an alias for any legacy class that hasn't
          // been migrated; it now points at the Plex Mono display face.
          "var(--font-headline)",
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
        "serif-italic": [
          "var(--font-serif-alt)",
          "IBM Plex Mono",
          "ui-monospace",
          "monospace",
        ],
        mono: [
          "var(--font-headline)",
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
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
        "elevation-1": "0 1px 3px rgba(15, 37, 68, 0.06)",
        "elevation-2": "0 4px 12px rgba(15, 37, 68, 0.10)",
        "elevation-3": "0 16px 48px rgba(15, 37, 68, 0.16)",
        "elevation-4": "0 8px 24px rgba(15, 37, 68, 0.14)",
      },
      borderRadius: {
        button: "6px",
        card: "4px",
        sm: "2px",
      },
    },
  },
  plugins: [],
} satisfies Config;
