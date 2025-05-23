import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: "sqlite",
    schema: "./electron/database/migrations/schema.ts",
    out: "./electron/database/migrations",
    dbCredentials: {
        url: `file:${`C:\\Users\\jakep\\OneDrive\\Documents\\colors2.dots`}`,
    },
    introspect: {
        casing: "preserve",
    },
});