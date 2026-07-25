import { defineConfig } from "vitest/config";
import path from "node:path";

// Standalone Vitest config, deliberately NOT next.config.ts / part of the
// Next.js build graph — `next build` never looks at this file, so it's safe
// to keep esbuild/jsx settings here that only matter for the test runner.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
