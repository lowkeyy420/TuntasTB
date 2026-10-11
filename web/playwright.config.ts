import { defineConfig } from "@playwright/test";

/**
 * Browser tests for the family check-in (daily-checkin 4.3, 4.4, 6.1, 6.5).
 *
 * They run against a running stack (`docker compose up -d --build web`, seeded)
 * and use the Microsoft Edge that ships with Windows, so no browser download is
 * needed. Run with `npm run test:e2e`. Not part of `npm test`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: {
    channel: "msedge",
    viewport: { width: 360, height: 640 },
    serviceWorkers: "allow",
  },
});
