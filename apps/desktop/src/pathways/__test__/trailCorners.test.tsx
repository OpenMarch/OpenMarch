import { afterEach, describe, expect, it } from "vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import {
    createResolver,
    type CornerCount,
    type TimelineSnapshot,
} from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { PathEditor } from "../PathEditor";
import { chipPlaces } from "../TrailCornerCounts";
import { subscribeHistoryChanges } from "@/db-functions/history";
import { clearPath, showPath, usePathPenStore } from "../pathPenStore";
import type { PathTarget } from "../pathTarget";
import { followTarget, type FollowDrag } from "../followDrag";
import {
    cornerRange,
    formatCount,
    offCountTally,
    trailCornersOf,
} from "../trailCorners";
import type { PathSession } from "../pathPenStore";

/**
 * Corner counts for block letters, pathways step 6 (spec Appendix L.9): the counts the field shows
 * for the trail a session holds (TC-1 to TC-4), the chips and the corner's list (TC-5, TC-6), and
 * the path bar's warning (TC-7). QA-TC-2, QA-TC-3, QA-TC-7, QA-TC-8, QA-TC-9 and QA-TC-13 in the app.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const S = fieldProperties.pixelsPerStep;
const p = (x: number, y: number) => ({ x: x * S, y: y * S });

/** QA-TC-2's line, in steps: four 2 apart, M4 leading, up 8 then right 8, ends along the way */
const homes = [p(0, 0), p(2, 0), p(4, 0), p(6, 0)];
const spots = [p(8, 8), p(10, 8), p(12, 8), p(14, 8)];

function alongTarget(counts = 16): PathTarget {
    const members = homes.map((from, i) => ({
        marcherId: i + 1,
        drill: `T${i + 1}`,
        from,
        to: spots[i]!,
    }));
    return {
        timelineId: 1,
        transitionId: 1,
        marcherId: 4,
        start: 32,
        end: 32 + counts,
        from: homes[3]!,
        to: spots[0]!,
        routeId: 9,
        points: [
            { id: "a", at: [6 * S, 8 * S] },
            { id: "b", at: [14 * S, 8 * S] },
        ],
        ends: { from: [6 * S, 0], to: [14 * S, 8 * S] },
        group: null,
        trail: {
            members,
            leaderId: 4,
            reverse: false,
            along: true,
        },
    };
}

const sessionOf = (target: PathTarget): PathSession => {
    act(() => showPath(target, "T4"));
    return usePathPenStore.getState().session!;
};

afterEach(() => {
    act(() => clearPath());
    cleanup();
});

/** Each corner's turns as [drill, count to a tenth], leader first */
const listed = (s: PathSession) => {
    const view = trailCornersOf(s)!;
    return view.corners.map((c) =>
        c.turns.map((t) => [view.drills[t.q], formatCount(t.count)]),
    );
};

describe("corner counts on a trail (spec L.9, pathways step 6)", () => {
    it("QA-TC-2: a stored trail along the way, every turn on a count, counted from the move's start", () => {
        const s = sessionOf(alongTarget());
        expect(listed(s)).toEqual([
            [
                ["T3", "2"],
                ["T2", "4"],
                ["T1", "6"],
            ],
            [
                ["T4", "8"],
                ["T3", "10"],
                ["T2", "12"],
                ["T1", "14"],
            ],
        ]);
        expect(offCountTally(trailCornersOf(s))).toEqual({
            turns: 0,
            corners: 0,
        });
        expect(trailCornersOf(s)!.corners.map(cornerRange)).toEqual([
            "2–6",
            "8–14",
        ]);
    });

    it("a trail nobody founds (each taken over at its start) has no counts (TC-2)", () => {
        const t = alongTarget();
        const s = sessionOf({ ...t, trail: { ...t.trail!, unfounded: true } });
        expect(trailCornersOf(s)).toBeNull();
    });

    it("QA-TC-9: a founder taken over partway turns at no corner after it leaves (TC-2)", () => {
        const t = alongTarget();
        // T1 is taken over on beat 32 + 9: it would turn at (6,8) on count 14
        const members = t.trail!.members.map((m, q) =>
            q === 0 ? { ...m, until: 41 } : m,
        );
        const s = sessionOf({ ...t, trail: { ...t.trail!, members } });
        expect(listed(s)[1]).toEqual([
            ["T4", "8"],
            ["T3", "10"],
            ["T2", "12"],
        ]);
        expect(trailCornersOf(s)!.corners[1]!.stopBefore).toBe(1);
        // its turn at the leader's start, on count 6, is before it leaves
        expect(listed(s)[0]).toContainEqual(["T1", "6"]);
    });

    it("QA-TC-3: over 12 counts, turns fall between counts", () => {
        const s = sessionOf(alongTarget(12));
        expect(listed(s)).toEqual([
            [
                ["T3", "1.5"],
                ["T2", "3"],
                ["T1", "4.5"],
            ],
            [
                ["T4", "6"],
                ["T3", "7.5"],
                ["T2", "9"],
                ["T1", "10.5"],
            ],
        ]);
        expect(offCountTally(trailCornersOf(s))).toEqual({
            turns: 4,
            corners: 2,
        });
    });

    it("a point dragged on the open trail changes the counts with it, before anything is saved", () => {
        const s = sessionOf(alongTarget());
        // the corner moved 1 step up: the leader's walk is longer and its corner farther, so its
        // count there changes before the edit is saved
        const moved: PathSession = {
            ...s,
            phase: "open",
            points: [{ id: "a", at: p(6, 9) }, s.points[1]!],
        };
        const before = trailCornersOf(s)!.corners[1]!;
        const after = trailCornersOf(moved)!.corners[1]!;
        expect(after.at).toEqual([6 * S, 9 * S]);
        expect(after.turns[0]!.count).not.toBeCloseTo(
            before.turns[0]!.count,
            3,
        );
    });

    it("a trail into end spots with a gap reads the whole end line, as the resolver does", () => {
        // three founders; slot 1 is vacant, its spot off the line, so the end line bends there
        const db: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 3, home: [8, 0] },
            ],
            shapes: {},
            transitions: {
                1: {
                    id: 1,
                    start: 0,
                    end: 16,
                    dest: null,
                    points: [
                        [20, 10],
                        [24, 12],
                        [20, 22],
                    ],
                    slots: 3,
                    style: "follow_the_leader",
                    order: "slot",
                    params: { waypoints: [] },
                    route: 1,
                },
            },
            routes: {
                1: {
                    geometry: {
                        v: 1,
                        from: [8, 0],
                        to: [20, 10],
                        points: [{ id: "a", at: [14, 0] }],
                    },
                },
            },
            assignments: [
                {
                    id: 1,
                    marcher: 1,
                    transition: 1,
                    slot: 0,
                    start: 0,
                    end: 16,
                    layer: 0,
                },
                {
                    id: 2,
                    marcher: 3,
                    transition: 1,
                    slot: 2,
                    start: 0,
                    end: 16,
                    layer: 0,
                },
            ],
        };
        const r = createResolver(db);
        const xy = ([x, y]: readonly [number, number]) => ({ x, y });
        const target: PathTarget = {
            timelineId: 1,
            transitionId: 1,
            marcherId: 3,
            start: 0,
            end: 16,
            from: { x: 8, y: 0 },
            to: { x: 20, y: 10 },
            routeId: 1,
            points: [{ id: "a", at: [14, 0] }],
            ends: { from: [8, 0], to: [20, 10] },
            group: null,
            trail: {
                members: [
                    {
                        marcherId: 1,
                        drill: "A1",
                        from: xy([0, 0]),
                        to: xy([20, 10]),
                        endAt: 0,
                    },
                    {
                        marcherId: 3,
                        drill: "A3",
                        from: xy([8, 0]),
                        to: xy([20, 22]),
                        // its slot is 2: slot 1 is the vacant spot (24,12)
                        endAt: 2,
                    },
                ],
                leaderId: 3,
                reverse: false,
                endLine: [xy([20, 10]), xy([24, 12]), xy([20, 22])],
            },
        };
        const view = trailCornersOf(sessionOf(target))!;
        // the entrance (20,10) and the gap's bend (24,12): only the leader turns at either
        const entrance = view.corners.find(
            (c) => c.at[0] === 20 && c.at[1] === 10,
        )!;
        const bend = view.corners.find((c) => c.at[0] === 24)!;
        for (const c of [entrance, bend]) {
            expect(c.turns.map((t) => view.drills[t.q])).toEqual(["A3"]);
            const at = r.positionAt(3, c.turns[0]!.count);
            expect(at[0]).toBeCloseTo(c.at[0], 6);
            expect(at[1]).toBeCloseTo(c.at[1], 6);
        }
    });

    it("dragging out a trail: the counts follow the pointer (DL-20)", () => {
        const starts = new Map(homes.map((h, i) => [i + 1, h]));
        const follow: FollowDrag = {
            window: { start: 9, end: 17 },
            ids: [1, 2, 3, 4],
            order: [1, 2, 3, 4],
            starts,
            grabbed: 4,
            spacing: { kind: "keep" },
            ends: "trail",
            keep: null,
            step: S,
        };
        const base: PathTarget = {
            timelineId: -1,
            transitionId: -1,
            marcherId: 4,
            start: 9,
            end: 17,
            from: homes[3]!,
            to: homes[3]!,
            routeId: null,
            points: [],
            ends: null,
            group: null,
        };
        const drills = new Map([1, 2, 3, 4].map((id) => [id, `T${id}`]));
        const session = (pointer: { x: number; y: number }): PathSession => ({
            phase: "drawing",
            target: followTarget(base, follow, drills),
            drill: "T4",
            points: [],
            pointer,
            selected: null,
            dragging: null,
            object: false,
            follow,
        });
        // 10 steps straight up from the leader over 8 counts: each walks 10 steps (Keep spacing),
        // so a follower 2 steps behind turns at the leader's start on 1.6, the tail (6 behind) on 4.8
        expect(listed(session(p(6, 10)))).toEqual([
            [
                ["T3", "1.6"],
                ["T2", "3.2"],
                ["T1", "4.8"],
            ],
        ]);
        // 8 steps up: one step a count, so every turn is on a count
        expect(listed(session(p(6, 8)))).toEqual([
            [
                ["T3", "2"],
                ["T2", "4"],
                ["T1", "6"],
            ],
        ]);
    });

    it("formats counts to a tenth and ranges from the first to the last turn", () => {
        expect(formatCount(7.46)).toBe("7.5");
        expect(formatCount(6.04)).toBe("6");
        expect(formatCount(12)).toBe("12");
    });
});

describe("the corner chips and their lists (TC-5 to TC-7)", () => {
    it("QA-TC-7: a selected trail shows a chip at each corner; a tap lists who turns when, and nothing is written", () => {
        let commits = 0;
        const stop = subscribeHistoryChanges(() => commits++);
        act(() => showPath(alongTarget(), "T4"));
        render(<PathEditor fieldProperties={fieldProperties} />);
        const chips = screen.getAllByTestId("trail-corner-count");
        expect(chips.map((c) => c.textContent)).toEqual(["2–6", "8–14"]);
        expect(chips.every((c) => c.dataset.off === undefined)).toBe(true);
        act(() => {
            fireEvent.click(chips[1]!);
        });
        const list = screen.getByTestId("trail-corner-list");
        const rows = screen.getAllByTestId("trail-corner-turn");
        expect(rows.map((r) => r.textContent)).toEqual([
            "T4count 8",
            "T3count 10",
            "T2count 12",
            "T1count 14",
        ]);
        expect(list).toBeTruthy();
        // a read: no history commit (nothing on the undo stack), and the session untouched
        expect(commits).toBe(0);
        expect(usePathPenStore.getState().session!.phase).toBe("closed");
        // Space on a chip reached by keyboard is the chip's, not Play's (ShortcutDispatcher)
        expect(chips[0]!.closest("[data-shape-ui]")).toBe(chips[0]);
        stop();
    });

    it("QA-TC-8: a corner off a count warns on its chip, in its list and on the open trail's path bar", () => {
        act(() => showPath(alongTarget(12), "T4"));
        act(() => {
            const s = usePathPenStore.getState().session!;
            usePathPenStore.setState({ session: { ...s, phase: "open" } });
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        const chips = screen.getAllByTestId("trail-corner-count");
        expect(chips.map((c) => c.dataset.off)).toEqual(["true", "true"]);
        expect(screen.getByTestId("path-off-count").textContent).toBe(
            "Turns between counts",
        );
        act(() => {
            fireEvent.click(chips[1]!);
        });
        const rows = screen.getAllByTestId("trail-corner-turn");
        expect(rows.map((r) => r.dataset.onCount)).toEqual([
            "true",
            "false",
            "true",
            "false",
        ]);
        expect(rows[1]!.textContent).toBe("T37.5 · between 7 and 8");
        // a tap on the bar's warning shows its detail (a finger has no hover)
        act(() => {
            fireEvent.click(screen.getByTestId("path-off-count"));
        });
        expect(
            screen.getByTestId("path-off-count-detail").textContent,
        ).toContain("4 turns fall between counts, at 2 corners");
    });
});

describe("chips in a dense block or zoomed out (TC-5)", () => {
    it("QA-TC-13: leaves out a chip that would sit on one already placed, keeping the first along the way", () => {
        const corner = (d: number, x: number): CornerCount => ({
            d,
            at: [x, 0],
            turn: Math.PI / 2,
            dirIn: [1, 0],
            dirOut: [0, 1],
            turns: [{ q: 0, count: d, onCount: true }],
            stopBefore: 0,
            offCount: false,
        });
        const corners = [corner(1, 0), corner(2, 30), corner(3, 100)];
        const places = chipPlaces(corners, (x, y) => ({ x, y }));
        expect(places.map((p) => p.corner.d)).toEqual([1, 3]);
    });
});
