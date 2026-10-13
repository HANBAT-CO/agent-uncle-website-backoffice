import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit tests: pure modules only (story derivations, reducers, geometry, copy
 * guards). Node environment, no DOM. Browser behaviour is covered by the
 * Playwright suites in tests/e2e.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
