import { describe, expect, it } from "vitest";
import { createResolver, type TimelineSnapshot } from "@openmarch/core";
import { buildFocusScene, sceneHasGhosts } from "../timelineFocusScene";

/**
 * Scenario 1 of research/ownership (steal-out), small: green moves marchers 1 and 2 forward 160
 * over beats [0, 16); on beat 8 yellow takes marcher 2 sideways to (100, 80) by beat 24.
 */
const stealOut = (): TimelineSnapshot => ({
    marchers: [
        { id: 1, home: [0, 0] },
        { id: 2, home: [10, 0] },
    ],
    shapes: {},
    transitions: {
        1: {
            id: 1,
            start: 0,
            end: 16,
            dest: null,
            points: [
                [0, 160],
                [10, 160],
            ],
            slots: 2,
            style: "direct",
            order: "slot",
            params: null,
        },
        2: {
            id: 2,
            start: 8,
            end: 24,
            dest: null,
            points: [[100, 80]],
            slots: 1,
            style: "direct",
            order: "slot",
            params: null,
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
            marcher: 2,
            transition: 1,
            slot: 1,
            start: 0,
            end: 16,
            layer: 0,
        },
        {
            id: 3,
            marcher: 2,
            transition: 2,
            slot: 0,
            start: 8,
            end: 24,
            layer: 1,
        },
    ],
});

const GREEN = 10;
const YELLOW = 20;
const COLORS: Record<number, string> = { [GREEN]: "green", [YELLOW]: "yellow" };

const scene = () => {
    const snapshot = stealOut();
    return buildFocusScene({
        resolver: createResolver(snapshot),
        timeline: { id: GREEN, start: 0, end: 16 },
        members: [
            {
                marcherId: 1,
                transitionId: 1,
                slot: 0,
                start: 0,
                end: 16,
                layer: 0,
            },
            {
                marcherId: 2,
                transitionId: 1,
                slot: 1,
                start: 0,
                end: 16,
                layer: 0,
            },
        ],
        snapshot,
        timelineOfTransition: new Map([
            [1, GREEN],
            [2, YELLOW],
        ]),
        colorOf: (id) => COLORS[id]!,
    });
};

const last = <T>(xs: readonly T[]) => xs[xs.length - 1]!;

describe("buildFocusScene (docs/timeline/research/ownership/09-isolation.md)", () => {
    it("a member that stays: its path, start ring and destination, no ghosts", () => {
        const stays = scene().slots.find((s) => s.marcherId === 1)!;
        expect(stays.origin).toEqual({ x: 0, y: 0 });
        expect(stays.destination).toEqual({ x: 0, y: 160 });
        expect(stays.ghosts).toEqual([]);
        expect(stays.ghostEnd).toBeNull();
        expect(stays.forks).toEqual([]);
        expect(last(stays.performed[0]!)).toEqual({ x: 0, y: 160 });
    });

    it("a member stolen out: performed to the steal, then green's plan as a ghost to its ending", () => {
        const s = scene();
        const stolen = s.slots.find((x) => x.marcherId === 2)!;
        expect(stolen.performed).toHaveLength(1);
        expect(last(stolen.performed[0]!)).toEqual({ x: 10, y: 80 });
        expect(stolen.ghosts).toHaveLength(1);
        expect(stolen.ghosts[0]![0]).toEqual({ x: 10, y: 80 });
        expect(last(stolen.ghosts[0]!)).toEqual({ x: 10, y: 160 });
        // Where green would end it, though it really is in yellow then
        expect(stolen.destination).toBeNull();
        expect(stolen.ghostEnd).toEqual({ x: 10, y: 160 });
        expect(stolen.forks).toEqual([{ x: 10, y: 80, color: "yellow" }]);
        expect(sceneHasGhosts(s)).toBe(true);
    });

    it("draws the move it leaves for over that move's whole span, past green's end", () => {
        const { context } = scene();
        expect(context).toHaveLength(1);
        expect(context[0]!.color).toBe("yellow");
        expect(context[0]!.points[0]).toEqual({ x: 10, y: 80 });
        expect(last(context[0]!.points)).toEqual({ x: 100, y: 80 });
    });

    it("isolating yellow: the stolen member's only path is its own, no ghosts", () => {
        const snapshot = stealOut();
        const s = buildFocusScene({
            resolver: createResolver(snapshot),
            timeline: { id: YELLOW, start: 8, end: 24 },
            members: [
                {
                    marcherId: 2,
                    transitionId: 2,
                    slot: 0,
                    start: 8,
                    end: 24,
                    layer: 1,
                },
            ],
            snapshot,
            timelineOfTransition: new Map([
                [1, GREEN],
                [2, YELLOW],
            ]),
            colorOf: (id) => COLORS[id]!,
        });
        expect(s.color).toBe("yellow");
        expect(s.slots[0]!.origin).toEqual({ x: 10, y: 80 });
        expect(s.slots[0]!.destination).toEqual({ x: 100, y: 80 });
        expect(sceneHasGhosts(s)).toBe(false);
    });

    it("a member with two rows in the timeline keeps both as its path (code review 6)", () => {
        const snapshot: TimelineSnapshot = {
            marchers: [{ id: 1, home: [0, 0] }],
            shapes: {},
            transitions: {
                1: {
                    id: 1,
                    start: 0,
                    end: 16,
                    dest: null,
                    points: [[0, 80]],
                    slots: 1,
                    style: "direct",
                    order: "slot",
                    params: null,
                },
                2: {
                    id: 2,
                    start: 0,
                    end: 16,
                    dest: null,
                    points: [[0, 160]],
                    slots: 1,
                    style: "direct",
                    order: "slot",
                    params: null,
                },
            },
            assignments: [
                {
                    id: 1,
                    marcher: 1,
                    transition: 1,
                    slot: 0,
                    start: 0,
                    end: 8,
                    layer: 0,
                },
                {
                    id: 2,
                    marcher: 1,
                    transition: 2,
                    slot: 0,
                    start: 8,
                    end: 16,
                    layer: 0,
                },
            ],
        };
        const s = buildFocusScene({
            resolver: createResolver(snapshot),
            timeline: { id: GREEN, start: 0, end: 16 },
            members: [
                {
                    marcherId: 1,
                    transitionId: 1,
                    slot: 0,
                    start: 0,
                    end: 8,
                    layer: 0,
                },
                {
                    marcherId: 1,
                    transitionId: 2,
                    slot: 0,
                    start: 8,
                    end: 16,
                    layer: 0,
                },
            ],
            snapshot,
            timelineOfTransition: new Map([
                [1, GREEN],
                [2, GREEN],
            ]),
            colorOf: (id) => COLORS[id]!,
        });
        expect(s.slots).toHaveLength(1);
        const slot = s.slots[0]!;
        expect(slot.origin).toEqual({ x: 0, y: 0 });
        expect(slot.performed[0]![0]).toEqual({ x: 0, y: 0 });
        expect(slot.ghosts).toEqual([]);
        expect(slot.destination).toEqual({ x: 0, y: 160 });
    });

    it("a member another move holds at the timeline's start gets a ghost from the start (code review 7)", () => {
        const snapshot = stealOut();
        // Yellow takes marcher 2 over [0, 4) instead, and green catches it up after
        snapshot.transitions[2] = {
            ...snapshot.transitions[2]!,
            start: 0,
            end: 4,
            points: [[50, 0]],
        };
        snapshot.assignments[2] = {
            ...snapshot.assignments[2]!,
            start: 0,
            end: 4,
        };
        const s = buildFocusScene({
            resolver: createResolver(snapshot),
            timeline: { id: GREEN, start: 0, end: 16 },
            members: [
                {
                    marcherId: 1,
                    transitionId: 1,
                    slot: 0,
                    start: 0,
                    end: 16,
                    layer: 0,
                },
                {
                    marcherId: 2,
                    transitionId: 1,
                    slot: 1,
                    start: 0,
                    end: 16,
                    layer: 0,
                },
            ],
            snapshot,
            timelineOfTransition: new Map([
                [1, GREEN],
                [2, YELLOW],
            ]),
            colorOf: (id) => COLORS[id]!,
        });
        const held = s.slots.find((x) => x.marcherId === 2)!;
        // The plan over [0, 4), then the plan beside the catch-up
        expect(held.ghosts.length).toBeGreaterThanOrEqual(1);
        expect(held.ghosts[0]![0]).toEqual({ x: 10, y: 0 });
        expect(s.context.map((c) => c.color)).toEqual(["yellow"]);
        expect(held.destination).toEqual({ x: 10, y: 160 });
    });

    it("marks a member that holds still over the whole move", () => {
        const snapshot = stealOut();
        snapshot.transitions[1] = {
            ...snapshot.transitions[1]!,
            points: [
                [0, 0],
                [10, 160],
            ],
        };
        const s = buildFocusScene({
            resolver: createResolver(snapshot),
            timeline: { id: GREEN, start: 0, end: 16 },
            members: [
                {
                    marcherId: 1,
                    transitionId: 1,
                    slot: 0,
                    start: 0,
                    end: 16,
                    layer: 0,
                },
            ],
            snapshot,
            timelineOfTransition: new Map([
                [1, GREEN],
                [2, YELLOW],
            ]),
            colorOf: (id) => COLORS[id]!,
        });
        expect(s.slots[0]!.holds).toBe(true);
    });
});
