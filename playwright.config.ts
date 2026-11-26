import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --import tsx server.ts",
    url: "http://127.0.0.1:4174/api/health",
    env: {
      ALLOWED_ORIGIN: "http://127.0.0.1:4174",
      NODE_ENV: "development",
      PORT: "4174",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
