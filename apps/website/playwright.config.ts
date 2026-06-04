import { defineConfig, devices } from "@playwright/test";

const CMS_URL = "http://localhost:3000";
const WEBSITE_URL = "http://localhost:4321";

process.env.PAYLOAD_CMS_URL = CMS_URL;

export default defineConfig({
    testDir: "./tests/e2e",
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: "html",
    use: {
        baseURL: WEBSITE_URL,
        trace: "on-first-retry",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"], channel: "chromium" },
        },
    ],
    webServer: [
        {
            command: "pnpm dev",
            cwd: "../cms",
            url: `${CMS_URL}/api/posts`,
            name: "CMS",
            timeout: 120_000,
            reuseExistingServer: !process.env.CI,
        },
        {
            command: "pnpm dev",
            cwd: ".",
            url: WEBSITE_URL,
            name: "Website",
            timeout: 60_000,
            reuseExistingServer: !process.env.CI,
            env: {
                ...process.env,
                PAYLOAD_CMS_URL: CMS_URL,
            },
        },
    ],
});
