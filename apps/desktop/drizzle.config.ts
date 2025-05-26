import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error(
        "DATABASE_URL is not set. Example: DATABASE_URL=file:./test.db",
    );
}

export default defineConfig({
    dialect: "sqlite",
    schema: "./electron/database/migrations/schema.ts",
    out: "./electron/database/migrations",
    dbCredentials: {
        url: databaseUrl,
    },
    introspect: {
        casing: "preserve",
    },
});
