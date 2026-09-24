import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      // Ratchet floor, measured 2026-09-24 on the whole of src/ (commands
      // included). Raise these as coverage grows; never lower them to get green.
      thresholds: {
        statements: 15,
        branches: 16,
        functions: 22,
        lines: 15,
      },
    },
  },
});
