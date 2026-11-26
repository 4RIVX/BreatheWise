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
      exclude: [
        "src/**/*.node-test.ts",
        "src/main.tsx",
        "server.ts",
        "dist/**",
        "tests/**",
      ],
      thresholds: {
        statements: 84.73,
        branches: 74.1,
        functions: 80.44,
        lines: 87.21,
      },
    },
  },
});
