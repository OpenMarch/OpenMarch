import { describe, expect, it } from "vitest";
import {
    ownLinesDrawn,
    pathMarcherIds,
    type OwnLine,
    type PathSession,
} from "../pathPenStore";

const session = (phase: PathSession["phase"]): PathSession =>
    ({
        phase,
        target: { marcherId: 7 },
        drill: "T7",
        points: [],
        pointer: null,
        selected: null,
        dragging: null,
    }) as unknown as PathSession;

/**
 * The marchers whose start flag positions give way to the pen's line: only while the field
 * actually draws that line (owner on #683: a placed box selected hid every member's path)
 */
describe("pathMarcherIds", () => {
    it("names the pen's marcher while its path is drawn", () => {
        expect(pathMarcherIds(session("closed"), false, false)).toEqual([7]);
        expect(pathMarcherIds(session("open"), false, false)).toEqual([7]);
    });

    it("names no one while a closed path is hidden or under an open shape", () => {
        expect(pathMarcherIds(session("closed"), true, false)).toEqual([]);
        expect(pathMarcherIds(session("closed"), false, true)).toEqual([]);
        expect(pathMarcherIds(null, false, false)).toEqual([]);
    });

    it("an open or drawn path takes the field over a shape", () => {
        expect(pathMarcherIds(session("open"), false, true)).toEqual([7]);
        expect(pathMarcherIds(session("drawing"), false, true)).toEqual([7]);
    });

    it("a quiet group path names only the marchers whose lines it draws (interaction round 2)", () => {
        const group = (
            phase: PathSession["phase"],
            lane?: PathSession["lane"],
        ): PathSession =>
            ({
                ...session(phase),
                lane,
                target: {
                    marcherId: 1,
                    group: {
                        members: [1, 2, 3].map((marcherId) => ({ marcherId })),
                        outside: [{ marcherId: 9 }],
                    },
                },
            }) as unknown as PathSession;
        // Quiet: the selected members and the selected marchers off it
        expect(pathMarcherIds(group("closed"), false, false, [], [2])).toEqual([
            2, 9,
        ]);
        // Edited: every member's lane round the group line
        expect(pathMarcherIds(group("open"), false, false, [], [2])).toEqual([
            1, 2, 3,
        ]);
        // Adjusting one lane: that marcher alone
        expect(
            pathMarcherIds(
                group("open", { marcherId: 3, key: null }),
                false,
                false,
                [],
                [3],
            ),
        ).toEqual([3]);
    });

    it("several marchers on their own paths each draw their line, and theirs give way (round 8)", () => {
        const line = (marcherId: number): OwnLine =>
            ({
                target: { marcherId, routeId: marcherId * 10 },
                drill: `T${marcherId}`,
            }) as unknown as OwnLine;
        const lines = [line(4), line(5)];
        expect(ownLinesDrawn(lines, null, false, false)).toBe(lines);
        expect(
            pathMarcherIds(
                null,
                false,
                false,
                [],
                [],
                ownLinesDrawn(lines, null, false, false),
            ),
        ).toEqual([4, 5]);
        // Hidden as a closed path is, under an open shape, or with a session of its own: none
        expect(ownLinesDrawn(lines, null, true, false)).toEqual([]);
        expect(ownLinesDrawn(lines, null, false, true)).toEqual([]);
        expect(ownLinesDrawn(lines, session("closed"), false, false)).toEqual(
            [],
        );
    });
});
