// Register jest-dom on this package's own `expect`. The "@testing-library/jest-dom/vitest"
// entry imports `vitest` itself, and since jest-dom doesn't depend on vitest that import
// resolves to whichever copy pnpm hoisted — often the workspace's vitest 3, not desktop's
// vitest 4 — leaving matchers like toBeInTheDocument missing ("Invalid Chai property").
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import type {} from "@testing-library/jest-dom/vitest"; // types only
import { expect, vi } from "vitest";
import { drizzle as drizzleSqliteProxy } from "drizzle-orm/sqlite-proxy";
import { schema } from "./electron/database/db";
import { createRendererSqlProxyQueue } from "./src/global/database/sqlProxyQueue";

expect.extend(jestDomMatchers);

// @ts-ignore
global.jest = vi;

// Mock Electron modules globally
vi.mock("electron", () => import("./src/__mocks__/electron"));

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
