import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { createRendererSqlProxyQueue } from "../sqlProxyQueue";

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
};

const deferred = <T>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe("createRendererSqlProxyQueue", () => {
    it("executes concurrent requests in FIFO order", async () => {
        const first = deferred<{ rows: any[] }>();
        const second = deferred<{ rows: any[] }>();

        const execute = vi
            .fn()
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise);
        const queue = createRendererSqlProxyQueue(execute);

        const firstCall = queue("select 1", [], "all");
        const secondCall = queue("select 2", [], "all");

        await Promise.resolve();
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenNthCalledWith(1, "select 1", [], "all");

        first.resolve({ rows: [[1]] });
        await expect(firstCall).resolves.toEqual({ rows: [[1]] });

        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute).toHaveBeenNthCalledWith(2, "select 2", [], "all");

        second.resolve({ rows: [[2]] });
        await expect(secondCall).resolves.toEqual({ rows: [[2]] });
    });

    it("continues processing after a failed request", async () => {
        const execute = vi
            .fn()
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce({ rows: [[2]] });
        const queue = createRendererSqlProxyQueue(execute);

        const firstCall = queue("bad query", [], "run");
        const secondCall = queue("good query", [], "all");

        await expect(firstCall).rejects.toThrow("boom");
        await expect(secondCall).resolves.toEqual({ rows: [[2]] });
        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute).toHaveBeenNthCalledWith(1, "bad query", [], "run");
        expect(execute).toHaveBeenNthCalledWith(2, "good query", [], "all");
    });

    it("maps each queued promise to its own response", async () => {
        const execute = vi.fn(
            async (sql: string): Promise<{ rows: any[] }> => ({
                rows: [[sql]],
            }),
        );
        const queue = createRendererSqlProxyQueue(execute);

        const firstCall = queue("query a", [], "get");
        const secondCall = queue("query b", [], "values");

        await expect(firstCall).resolves.toEqual({ rows: [["query a"]] });
        await expect(secondCall).resolves.toEqual({ rows: [["query b"]] });
    });

    it("preserves FIFO and never runs more than one call concurrently", async () => {
        const operationArbitrary = fc.record({
            method: fc.constantFrom("all", "run", "get", "values"),
            shouldFail: fc.boolean(),
            delayMs: fc.integer({ min: 0, max: 3 }),
        });

        await fc.assert(
            fc.asyncProperty(
                fc.array(operationArbitrary, { minLength: 0, maxLength: 40 }),
                async (operations) => {
                    const startOrder: number[] = [];
                    let inFlight = 0;
                    let maxInFlight = 0;

                    const execute = vi.fn(
                        async (
                            sql: string,
                            _params: any[],
                            _method: string,
                        ) => {
                            if (sql === "tail") {
                                return { rows: [["tail"]] };
                            }

                            const index = Number(sql.replace("q-", ""));
                            const op = operations[index];

                            startOrder.push(index);
                            inFlight += 1;
                            maxInFlight = Math.max(maxInFlight, inFlight);

                            await new Promise<void>((resolve) =>
                                setTimeout(resolve, op?.delayMs ?? 0),
                            );

                            inFlight -= 1;

                            if (op?.shouldFail) {
                                throw new Error(`fail-${index}`);
                            }

                            return { rows: [[index]] };
                        },
                    );

                    const queue = createRendererSqlProxyQueue(execute);

                    const queuedCalls = operations.map((operation, index) =>
                        queue(`q-${index}`, [index], operation.method),
                    );

                    const settled = await Promise.allSettled(queuedCalls);

                    expect(startOrder).toEqual(
                        operations.map((_, index) => index),
                    );
                    expect(maxInFlight).toBeLessThanOrEqual(1);
                    expect(settled).toHaveLength(operations.length);

                    settled.forEach((result, index) => {
                        if (operations[index]?.shouldFail) {
                            expect(result.status).toBe("rejected");
                            if (result.status === "rejected") {
                                expect((result.reason as Error).message).toBe(
                                    `fail-${index}`,
                                );
                            }
                        } else {
                            expect(result.status).toBe("fulfilled");
                            if (result.status === "fulfilled") {
                                expect(result.value).toEqual({
                                    rows: [[index]],
                                });
                            }
                        }
                    });

                    const tailCall = await queue("tail", [], "all");
                    expect(tailCall).toEqual({ rows: [["tail"]] });
                },
            ),
            { numRuns: 100, seed: 20260403 },
        );
    });
});
