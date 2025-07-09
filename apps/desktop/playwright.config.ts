// import { defineConfig, devices } from "@playwright/test";

// export default defineConfig({
//     testDir: "./e2e",
//     maxFailures: 2,
// });

import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: [process.env.CI ? ["dot"] : ["list", "html"]],
    use: {
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
    outputDir: "./playwright-report",
});
