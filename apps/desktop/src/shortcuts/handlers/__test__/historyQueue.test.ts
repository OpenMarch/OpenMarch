import { afterEach, describe, expect, it } from "vitest";
import {
    queueHistoryAction,
    setHistoryPerformer,
    type HistoryDirection,
} from "../historyQueue";

describe("queueHistoryAction", () => {
    let uninstall = () => {};
    afterEach(() => uninstall());

    /** A stack of `size` entries; each undo takes a while and pops one. */
    const install = (size: number) => {
        const done: HistoryDirection[] = [];
        let running = 0;
        let maxRunning = 0;
        let stack = size;
        uninstall = setHistoryPerformer(async (direction) => {
            running++;
            maxRunning = Math.max(maxRunning, running);
            // The stack check and the action, both after a delay
            await new Promise((r) => setTimeout(r, 5));
            const ok = direction === "undo" ? stack > 0 : true;
            if (ok) {
                stack += direction === "undo" ? -1 : 1;
                done.push(direction);
            }
            running--;
            return ok;
        });
        return { done, maxRunning: () => maxRunning };
    };

    it("keeps every fast press, in order, one at a time", async () => {
        const { done, maxRunning } = install(5);
        const results = await Promise.all([
            queueHistoryAction("undo"),
            queueHistoryAction("undo"),
            queueHistoryAction("undo"),
            queueHistoryAction("redo"),
        ]);
        expect(results).toEqual([true, true, true, true]);
        expect(done).toEqual(["undo", "undo", "undo", "redo"]);
        expect(maxRunning()).toBe(1);
    });

    it("tells each press whether it undid anything", async () => {
        install(1);
        const results = await Promise.all([
            queueHistoryAction("undo"),
            queueHistoryAction("undo"),
        ]);
        expect(results).toEqual([true, false]);
    });

    it("keeps going after a press that fails", async () => {
        let calls = 0;
        uninstall = setHistoryPerformer(async () => {
            calls++;
            if (calls === 1) throw new Error("boom");
            return true;
        });
        const results = await Promise.all([
            queueHistoryAction("undo"),
            queueHistoryAction("undo"),
        ]);
        expect(results).toEqual([false, true]);
    });

    it("does nothing without a performer", async () => {
        uninstall();
        expect(await queueHistoryAction("undo")).toBe(false);
    });
});
