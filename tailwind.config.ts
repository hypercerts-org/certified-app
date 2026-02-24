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
        navy: "#0F2544",
        accent: "#60A1E2",
        sky: "#A3CDF2",
        deep: "#1A3A6B",
        gray: {
          50: "#F7F8FA",
          100: "#EEF0F4",
          200: "#E2E5EB",
          400: "#8A92A0",
          600: "#525B6A",
          700: "#3B4251",
        },
        success: "#2ECC71",
        warning: "#F5A623",
        error: "#E74C3C",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: [
          "JetBrains Mono",
          "IBM Plex Mono",
          "SF Mono",
          "ui-monospace",
          "Courier New",
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
