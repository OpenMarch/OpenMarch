import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { drizzle as drizzleSqliteProxy } from "drizzle-orm/sqlite-proxy";
import { schema } from "./electron/database/db";
import { createRendererSqlProxyQueue } from "./src/global/database/sqlProxyQueue";

// @ts-ignore
global.jest = vi;

// Mock Electron modules globally
vi.mock("electron", () => import("./src/__mocks__/electron"));

// electron-store needs Electron's app to find its folder, and it loads the
// real "electron" (not the mock above) because it isn't inlined. Main-process
// modules create stores at import time, so give them an in-memory one.
vi.mock("electron-store", () => ({
    default: class {
        private data = new Map<string, unknown>();
        constructor(options?: { defaults?: Record<string, unknown> }) {
            for (const [key, value] of Object.entries(options?.defaults ?? {}))
                this.data.set(key, value);
        }
        get(key: string, defaultValue?: unknown) {
            return this.data.has(key) ? this.data.get(key) : defaultValue;
        }
        set(key: string, value: unknown) {
            this.data.set(key, value);
        }
        has(key: string) {
            return this.data.has(key);
        }
        delete(key: string) {
            this.data.delete(key);
        }
        clear() {
            this.data.clear();
        }
    },
}));

// Mock the database module globally to prevent import-time database creation
vi.mock("@/global/database/db", () => {
    const queuedSqlProxy = createRendererSqlProxyQueue(
        async (
            sql: string,
            params: any[],
            method: "all" | "run" | "get" | "values",
        ) => {
            // Check if window.electron.sqlProxy is available
            if (typeof window !== "undefined" && window.electron?.sqlProxy) {
                return await window.electron.sqlProxy(sql, params, method);
            }
            throw new Error(
                "window.electron.sqlProxy not available - test setup issue",
            );
        },
    );

    return {
        db: drizzleSqliteProxy(
            async (
                sql: string,
                params: any[],
                method: "all" | "run" | "get" | "values",
            ) => queuedSqlProxy(sql, params, method),
            { schema, casing: "snake_case" },
        ),
        schema,
    };
});
