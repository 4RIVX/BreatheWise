import fs from "node:fs";
import { defineConfig } from "@playwright/test";

const containerShellPath =
  "/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (fs.existsSync(containerShellPath) ? containerShellPath : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    headless: true,
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://127.0.0.1:3000/api/health",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
