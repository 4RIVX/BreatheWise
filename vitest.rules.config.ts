import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.spec.ts"],
    testTimeout: 20_000,
  },
});
