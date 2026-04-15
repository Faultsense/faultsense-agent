import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

// Inject the same __FS_VERSION__ constant the production build uses,
// sourced from package.json so tests and the shipped bundle can never
// disagree on the version. See scripts/build.mjs for the prod side.
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

export default defineConfig({
  define: {
    __FS_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./setupTests.ts"],
    // Layer 1 tests live under tests/. Layer 2 drivers under conformance/
    // are Playwright specs and must NOT be collected by vitest.
    include: ["tests/**/*.{test,spec}.{js,ts}"],
    exclude: ["**/node_modules/**", "**/dist/**", "conformance/**"],
  },
});
