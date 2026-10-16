import { describe, expect, it, vi } from "vitest";
import {
    createHistoryPressQueue,
    type HistoryDirection,
} from "../handlers/historyPressQueue";

/** A run whose presses settle only when the test says so */
const controlledRun = () => {
    const started: HistoryDirection[] = [];
    const finishers: (() => void)[] = [];
    const run = (direction: HistoryDirection) =>
        new Promise<void>((resolve) => {
            started.push(direction);
            finishers.push(resolve);
        });
    return { run, started, finishNext: () => finishers.shift()!() };
};

describe("createHistoryPressQueue (#223)", () => {
    it("runs a press made while another is running after it, not never", async () => {
        const { run, started, finishNext } = controlledRun();
        const queue = createHistoryPressQueue(run);

        const undo = queue.press("undo");
        const redo = queue.press("redo");
        await Promise.resolve();
        expect(started).toEqual(["undo"]);
        expect(queue.busy()).toBe(true);

        finishNext();
        await undo;
        expect(started).toEqual(["undo", "redo"]);
        expect(queue.busy()).toBe(true);

        finishNext();
        await redo;
        expect(queue.busy()).toBe(false);
    });

    it("keeps going after a press fails", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const run = vi
            .fn<(direction: HistoryDirection) => Promise<void>>()
            .mockRejectedValueOnce(new Error("locked"))
            .mockResolvedValue(undefined);
        const queue = createHistoryPressQueue(run);

        void queue.press("undo");
        await queue.press("undo");

        expect(run).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledOnce();
        expect(queue.busy()).toBe(false);
        error.mockRestore();
    });
});
