type SqlProxyMethod = "all" | "run" | "get" | "values";

type SqlProxyResult = {
    rows: any[] | any;
};

type SqlProxyInvoke = (
    sql: string,
    params: any[],
    method: SqlProxyMethod,
) => Promise<SqlProxyResult>;

/**
 * Ensures SQL proxy calls run in FIFO order with only one in-flight call.
 * The queue chain is kept alive even when a call rejects.
 */
export const createRendererSqlProxyQueue = (
    execute: SqlProxyInvoke,
): SqlProxyInvoke => {
    let tail = Promise.resolve<void>(undefined);

    return async (sql, params, method) => {
        const run = tail.then(() => execute(sql, params, method));

        tail = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    };
};
