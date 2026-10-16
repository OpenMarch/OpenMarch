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
 * Runs tasks in FIFO order with only one in flight. The chain is kept alive even when a task
 * rejects.
 */
export const createSerialQueue = () => {
    let tail = Promise.resolve<void>(undefined);

    return <T>(task: () => Promise<T>): Promise<T> => {
        const run = tail.then(task);

        tail = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    };
};

/**
 * Ensures SQL proxy calls run in FIFO order with only one in-flight call.
 * The queue chain is kept alive even when a call rejects.
 */
export const createRendererSqlProxyQueue = (
    execute: SqlProxyInvoke,
    serially = createSerialQueue(),
): SqlProxyInvoke => {
    return async (sql, params, method) =>
        serially(() => execute(sql, params, method));
};
