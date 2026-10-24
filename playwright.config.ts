import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:4322",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: "tsx e2e/prepare.ts && tsx e2e/server.ts",
    url: "http://localhost:4322/api/me",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
