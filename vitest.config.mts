import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The "@/..." paths from tsconfig.json, natively in Vite 8 (the Next.js
    // guide's vite-tsconfig-paths plugin predates this).
    tsconfigPaths: true,
    // Tests run server modules outside React Server Components, where the
    // "server-only" marker would throw.
    alias: {
      "server-only": fileURLToPath(new URL("node_modules/server-only/empty.js", import.meta.url)),
    },
  },
});
