/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
    test: {
        include: ["src/**/*.{test,spec}.{js,ts,tsx}"],
        environment: "node",
        env: {
            PAYLOAD_CMS_URL: "http://localhost:3000",
        },
    },
    define: {
        "import.meta.env.PAYLOAD_CMS_URL": JSON.stringify(
            process.env.PAYLOAD_CMS_URL ?? "http://localhost:3000",
        ),
    },
});
