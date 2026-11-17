import { describe, expect, it, vi } from "vitest";
import { dropMarchersOnTimeline, lockedItemsDrop } from "../fieldDrop";

vi.mock("@/timeline/timelineCoordinateWrites", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("@/timeline/timelineCoordinateWrites")
    >()),
    timelinePositionsSettled: () => Promise.resolve(),
}));

const isLocked = (id: number) => id >= 100;

describe("lockedItemsDrop", () => {
    it("writes a drop of locked items alone to their homes, whatever the timeline selects", () => {
        expect(
            lockedItemsDrop(
                [
                    { id: 100, x: 1, y: 2 },
                    { id: 101, x: 3, y: 4 },
                ],
                isLocked,
            ),
        ).toEqual({
            target: { kind: "home" },
            moves: [
                { marcherId: 100, x: 1, y: 2 },
                { marcherId: 101, x: 3, y: 4 },
            ],
        });
    });

    it("leaves a drop with anyone else to the timeline's rules", () => {
        expect(
            lockedItemsDrop(
                [
                    { id: 1, x: 1, y: 2 },
                    { id: 100, x: 3, y: 4 },
                ],
                isLocked,
            ),
        ).toBeNull();
        expect(lockedItemsDrop([], isLocked)).toBeNull();
    });
});

describe("dropMarchersOnTimeline", () => {
    it("saves a locked item's drop with nothing selected on the timeline", async () => {
        const write = vi.fn(() => Promise.resolve());
        const result = await dropMarchersOnTimeline(
            [{ id: 100, x: 5, y: 6 }],
            write,
            isLocked,
        );
        expect(result).toBe("saved");
        expect(write).toHaveBeenCalledWith({
            target: { kind: "home" },
            moves: [{ marcherId: 100, x: 5, y: 6 }],
        });
    });
});
