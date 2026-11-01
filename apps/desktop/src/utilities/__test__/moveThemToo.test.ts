// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    continueEditRun,
    editScope,
    editSurpriseToastId,
    forgetEditRun,
    marcherNamesList,
    moveThemTooMessage,
} from "../moveThemToo";

/**
 * **Move them too** (defined-coordinates 09, G4): the message and the edit runs. The writes are
 * in `timeline/__test__/timelineMoveThemToo.test.ts`.
 */

describe("the message", () => {
    it("names the marchers and their one page", () => {
        expect(
            moveThemTooMessage([
                { label: "OT1", page: "3" },
                { label: "OT8", page: "3" },
            ]),
        ).toEqual({
            message:
                "OT1 and OT8 have their own move on Page 3, so they kept their spot",
            actionLabel: "Move them too",
        });
        expect(moveThemTooMessage([{ label: "OT8", page: "3" }]).message).toBe(
            "OT8 has its own move on Page 3, so it kept its spot",
        );
    });

    it("with several pages, says their later moves", () => {
        expect(
            moveThemTooMessage([
                { label: "OT1", page: "3" },
                { label: "OT2", page: "4" },
                { label: "OT3", page: "3" },
            ]).message,
        ).toBe(
            "OT1, OT2 and OT3 have their own later moves, so they kept their spots",
        );
    });

    it("lists three names at most", () => {
        expect(marcherNamesList(["A1"])).toBe("A1");
        expect(marcherNamesList(["A1", "A2", "A3"])).toBe("A1, A2 and A3");
        expect(
            marcherNamesList(["OT1", "OT2", "OT3", "OT4", "OT5", "OT6"]),
        ).toBe("OT1, OT2 and 4 others");
    });
});

describe("a run of edits behind one toast", () => {
    /** An edit adding `n` to the run's total; returns the total and the run */
    const edit = (mode: "page" | "timeline", mark: number, n: number) => {
        const run = continueEditRun<number>(
            mode,
            mark,
            editScope([2], [1, 8]),
            (previous) => (previous ?? 0) + n,
        );
        run.shown(editSurpriseToastId());
        return run;
    };

    it("the next history change in the same mode adds up; anything else starts over", () => {
        forgetEditRun();
        expect(edit("page", 10, 1).value).toBe(1);
        expect(edit("page", 11, 2).value).toBe(3);
        // A gap (an undo, another edit)
        expect(edit("page", 13, 4).value).toBe(4);
        // Another mode
        expect(edit("timeline", 14, 8).value).toBe(8);
        // Another surprise toast in between
        editSurpriseToastId();
        expect(edit("timeline", 15, 16).value).toBe(16);
        // The toast closed, or its action ran
        edit("timeline", 16, 1).forget();
        const newer = edit("timeline", 17, 32);
        expect(newer.value).toBe(32);
        expect(newer.stale).toBe(false);
        // An older edit finishing late leaves the newer run alone, and is stale: no toast
        const late = continueEditRun<number>("timeline", 12, "", () => 99);
        expect(late.value).toBe(99);
        expect(late.stale).toBe(true);
        expect(edit("timeline", 18, 1).value).toBe(33);
        // Another page, or other marchers
        expect(
            continueEditRun<number>(
                "timeline",
                19,
                editScope([3], [1, 8]),
                (p) => (p ?? 0) + 1,
            ).value,
        ).toBe(1);
        expect(edit("timeline", 20, 1).value).toBe(1);
        expect(
            continueEditRun<number>(
                "timeline",
                21,
                editScope([2], [8]),
                (p) => (p ?? 0) + 1,
            ).value,
        ).toBe(1);
        // The same, in any order
        expect(editScope([2, 3], [8, 1])).toBe(editScope([3, 2], [1, 8]));
        forgetEditRun();
    });
});
