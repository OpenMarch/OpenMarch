import type { AsyncBatchRemoteCallback } from "drizzle-orm/sqlite-proxy";
import type {
    SqlBatchQuery,
    SqlProxyMethod,
    SqlReadBatchResult,
} from "@om-electron/database/sqlProxy";
import {
    createRendererSqlProxyQueue,
    createSerialQueue,
} from "./sqlProxyQueue";
import { createSqlReadBatch } from "./sqlReadBatch";

type SqlProxyResult = { rows: any[] | any };

/** What a renderer reaches main's SQL through: the editor's preload, or the 3D View's. */
export type RendererSqlApi =
    | {
          kind: "editor";
          sqlProxy: (
              sql: string,
              params: any[],
              method: SqlProxyMethod,
          ) => Promise<SqlProxyResult>;
          sqlReadBatch: (
              queries: SqlBatchQuery[],
          ) => Promise<SqlReadBatchResult>;
      }
    | {
          /** Only reads, all of them as batches (#243). */
          kind: "view3d";
          sqlReadBatch: (
              queries: SqlBatchQuery[],
          ) => Promise<SqlReadBatchResult>;
      };

/**
 * Drizzle's proxy and batch callbacks for a renderer. `getApi` is asked on every call, so the
 * window's preload decides each time (the 3D View window has no `window.electron`).
 */
export function createRendererSqlCallbacks(
    getApi: () => RendererSqlApi,
    options?: Parameters<typeof createSqlReadBatch>[2],
): {
    proxy: (
        sql: string,
        params: any[],
        method: SqlProxyMethod,
    ) => Promise<SqlProxyResult>;
    batch: AsyncBatchRemoteCallback;
} {
    // One queue for statements and batches, so each runs after the calls made before it
    const serially = createSerialQueue();

    // `db.batch` reads several tables as one snapshot (`readTimelineTablesSnapshot`)
    const batch = createSqlReadBatch(
        (queries) => getApi().sqlReadBatch(queries),
        serially,
        options,
    );

    const queuedSqlProxy = createRendererSqlProxyQueue(
        async (sql, params, method) => {
            const api = getApi();
            if (api.kind !== "editor")
                throw new Error("Only the editor sends single statements");
            return api.sqlProxy(sql, params, method);
        },
        serially,
    );

    /**
     * The 3D View window shares main's connection with the editor, whose transactions run one
     * statement per IPC call, so a single read could land inside one and see rows that aren't
     * committed yet (#243). It only reads, so each of its statements goes as a batch of one,
     * which main answers `busy` while a transaction is open and this asks again.
     */
    const proxy = async (sql: string, params: any[], method: SqlProxyMethod) =>
        getApi().kind === "editor"
            ? queuedSqlProxy(sql, params, method)
            : (await batch([{ sql, params, method }]))[0];

    return { proxy, batch };
}
