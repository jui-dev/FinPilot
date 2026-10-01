import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end flows run against the real app with its own demo database
 * (data/e2e.sqlite), rebuilt by the global setup before each run.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_DATABASE_PATH = process.env.E2E_DATABASE_PATH ?? "./data/e2e.sqlite";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/activity`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Settings' Data & demo controls are off unless enabled (src/server/data-controls.ts).
    env: { DATABASE_PATH: E2E_DATABASE_PATH, FINPILOT_DATA_CONTROLS: "enabled" },
  },
});
