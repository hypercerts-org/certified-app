import { defineConfig } from "vitest/config"
import path from "node:path"

/**
 * Vitest config for unit tests. Co-located with source under
 * `src/**\/__tests__/`. jsdom for any DOM-bound utility; the bulk of
 * the suite today is pure-function utilities under `src/lib/utils/`,
 * which don't actually need jsdom but the cost of having it is low.
 *
 * Path alias `@/*` mirrors `tsconfig.json` so test imports look the
 * same as production imports.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // No threshold today — we're bootstrapping. Add a threshold
      // once meaningful surfaces have suites.
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/__tests__/**", "src/**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
