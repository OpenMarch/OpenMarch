import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { drizzle as drizzleSqliteProxy } from "drizzle-orm/sqlite-proxy";
import { schema } from "./electron/database/db";

// @ts-ignore
global.jest = vi;

// Mock Electron modules globally
vi.mock("electron", () => import("./src/__mocks__/electron"));

// Mock the database module globally to prevent import-time database creation
vi.mock("@/global/database/db", () => {
    return {
        db: drizzleSqliteProxy(
            async (
                sql: string,
                params: any[],
                method: "all" | "run" | "get" | "values",
            ) => {
                // Check if window.electron.sqlProxy is available
                if (
                    typeof window !== "undefined" &&
                    window.electron?.sqlProxy
                ) {
                    return await window.electron.sqlProxy(sql, params, method);
                }
                throw new Error(
                    "window.electron.sqlProxy not available - test setup issue",
                );
            },
            { schema, casing: "snake_case" },
        ),
        schema,
    };
});
