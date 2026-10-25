import { describe, expect, it, vi } from "vitest";
import { undoIfStillLatest } from "../undoIfStillLatest";

const run = (token: string | null, latest: string | null) => {
    const undo = vi.fn();
    const unavailable = vi.fn();
    const result = undoIfStillLatest({
        token,
        getLatestToken: async () => latest,
        undo,
        unavailable,
    });
    return { result, undo, unavailable };
};

describe("undoIfStillLatest", () => {
    it("undoes while the entry is still the latest", async () => {
        const { result, undo, unavailable } = run("deletion", "deletion");
        expect(await result).toBe(true);
        expect(undo).toHaveBeenCalledOnce();
        expect(unavailable).not.toHaveBeenCalled();
    });

    it("leaves a later edit alone", async () => {
        const { result, undo, unavailable } = run("deletion", "later edit");
        expect(await result).toBe(false);
        expect(undo).not.toHaveBeenCalled();
        expect(unavailable).toHaveBeenCalledOnce();
    });

    it("does nothing once the entry was undone and nothing is left", async () => {
        const { result, undo, unavailable } = run("deletion", null);
        expect(await result).toBe(false);
        expect(undo).not.toHaveBeenCalled();
        expect(unavailable).toHaveBeenCalledOnce();
    });

    it("never undoes without a token", async () => {
        const { result, undo } = run(null, null);
        expect(await result).toBe(false);
        expect(undo).not.toHaveBeenCalled();
    });
});
