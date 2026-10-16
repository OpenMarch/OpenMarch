import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { expect, vi } from "vitest";
import { drizzle as drizzleSqliteProxy } from "drizzle-orm/sqlite-proxy";
import { schema } from "./electron/database/db";
import {
    createRendererSqlProxyQueue,
    createSerialQueue,
} from "./src/global/database/sqlProxyQueue";
import { createSqlReadBatch } from "./src/global/database/sqlReadBatch";

// jest-dom's matchers, on this app's own vitest. `@testing-library/jest-dom/vitest` extends
// whichever `vitest` pnpm hoists to the repo root, and other workspace packages still use
// vitest 3.x (types: src/jest-dom-vitest.d.ts).
expect.extend(jestDomMatchers);

// @ts-ignore
global.jest = vi;

// Mock Electron modules globally
vi.mock("electron", () => import("./src/__mocks__/electron"));

// Mock the database module globally to prevent import-time database creation
vi.mock("@/global/database/db", () => {
    const serially = createSerialQueue();
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
        serially,
    );
    // `db.batch`, like the app's (`readTimelineTablesSnapshot`)
    const sqlReadBatch = createSqlReadBatch(async (queries) => {
        if (typeof window !== "undefined" && window.electron?.sqlReadBatch)
            return await window.electron.sqlReadBatch(queries);
        throw new Error(
            "window.electron.sqlReadBatch not available - test setup issue",
        );
    }, serially);

    return {
        db: drizzleSqliteProxy(
            async (
                sql: string,
                params: any[],
                method: "all" | "run" | "get" | "values",
            ) => queuedSqlProxy(sql, params, method),
            sqlReadBatch,
            { schema, casing: "snake_case" },
        ),
        schema,
    };
});
