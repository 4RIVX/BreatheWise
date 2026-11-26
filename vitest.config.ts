import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts", "server.ts"],
      exclude: ["src/**/*.node-test.ts", "src/main.tsx", "dist/**", "tests/**"],
      thresholds: {
        statements: 77.77,
        branches: 68.83,
        functions: 73.14,
        lines: 79.98,
      },
    },
  },
});
