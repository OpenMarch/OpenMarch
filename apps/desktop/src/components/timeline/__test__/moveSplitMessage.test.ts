import { describe, expect, it } from "vitest";
import { moveSplitMessage } from "../useTimelineCommands";

describe("moveSplitMessage (the Split at playhead toast, #591)", () => {
    const beat = 13;

    it("names only the curved paths that restart after the split", () => {
        expect(
            moveSplitMessage(
                "Move 2",
                "Page 3",
                [
                    { marcherId: 1, fromBeat: 13 },
                    { marcherId: 2, fromBeat: 15 },
                ],
                beat,
            ),
        ).toBe(
            "Split Move 2 at Page 3 · 2 marchers' curved paths restart after it",
        );
    });

    it("says a path changing before the split is redrawn straight there", () => {
        expect(
            moveSplitMessage(
                "Move 2",
                "Page 3",
                [{ marcherId: 1, fromBeat: 10 }],
                beat,
            ),
        ).toBe(
            "Split Move 2 at Page 3 · 1 marcher's path is redrawn: straight before it, restarted after",
        );
    });

    it("counts each kind on its own when a move has both", () => {
        expect(
            moveSplitMessage(
                "Move 2",
                "Page 3",
                [
                    { marcherId: 1, fromBeat: 14 },
                    { marcherId: 2, fromBeat: 10 },
                    { marcherId: 3, fromBeat: 9 },
                ],
                beat,
            ),
        ).toBe(
            "Split Move 2 at Page 3 · 1 marcher's curved path restarts after it · 2 marchers' paths are redrawn: straight before it, restarted after",
        );
    });

    it("says nothing more when no path changes", () => {
        expect(moveSplitMessage("Move 2", "Page 3", [], beat)).toBe(
            "Split Move 2 at Page 3",
        );
    });
});
