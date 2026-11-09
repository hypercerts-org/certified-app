import { defineConfig } from "vitest/config";

export default defineConfig({
  // The "@/..." paths from tsconfig.json, natively in Vite 8 (the Next.js
  // guide's vite-tsconfig-paths plugin predates this).
  resolve: { tsconfigPaths: true },
});
