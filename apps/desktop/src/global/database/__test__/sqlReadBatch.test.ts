// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSqlReadBatch } from "../sqlReadBatch";
import { createSerialQueue } from "../sqlProxyQueue";

const query = { sql: "SELECT 1", params: [], method: "all" as const };

describe("createSqlReadBatch", () => {
    it("asks again while main is busy, letting other calls through the queue in between", async () => {
        const serially = createSerialQueue();
        const calls: string[] = [];
        let busy = 2;
        const batch = createSqlReadBatch(
            async () => {
                calls.push("batch");
                if (busy-- > 0) {
                    // The transaction's next statement, queued behind the batch, must still run
                    void serially(async () => calls.push("statement"));
                    return { busy: true };
                }
                return { busy: false, results: [{ rows: [[1]] }] };
            },
            serially,
            { retryMs: 1 },
        );

        await expect(batch([query])).resolves.toEqual([{ rows: [[1]] }]);
        expect(calls).toEqual([
            "batch",
            "statement",
            "batch",
            "statement",
            "batch",
        ]);
    });

    it("fails once main has been busy for longer than the timeout", async () => {
        const batch = createSqlReadBatch(
            async () => ({ busy: true }),
            undefined,
            { retryMs: 1, timeoutMs: 20 },
        );
        await expect(batch([query])).rejects.toThrow(/busy for too long/);
    });
});
