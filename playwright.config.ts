import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:3108",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: "msedge",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3108",
    url: "http://127.0.0.1:3108",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      PE_BUILD_DIR: ".next-e2e",
      PE_DATA_MODE: "demo",
      PE_DEMO_FILE: "e2e-demo.json",
      APP_URL: "http://127.0.0.1:3108",
      APP_ORIGIN: "http://127.0.0.1:3108",
      GOOGLE_AUTH_MODE: "",
      GOOGLE_REFRESH_TOKEN: "",
      OPENAI_API_KEY: "",
      APP_PASSWORD: "",
      SESSION_SECRET: "",
    },
  },
});
