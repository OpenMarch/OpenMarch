import type {
    AssignmentRow,
    PathParams,
    PathStyle,
    ShapeRow,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "@openmarch/core";
import {
    line,
    rowBuilder,
    tr,
    type FixtureTimeline,
    type TimelineFixture,
} from "./fixtureTypes";

/**
 * Data scenarios from the QA-SC suite (spec §12.8): SC-01, SC-03 and SC-05 as fixed shows, and
 * SC-11 as a seeded generator. Each returns plain rows; nothing here touches a database.
 */

/** Marchers 1..16 on a 4 x 4 block with 2-step spacing, row by row from the origin. */
const block16 = (): TimelineSnapshot["marchers"] =>
    Array.from({ length: 16 }, (_, i) => ({
        id: i + 1,
        home: [2 * (i % 4), 2 * Math.floor(i / 4)] as XY,
    }));

const circle = (center: XY, radius: number): ShapeRow => ({
    kind: "circle",
    geometry: { center, radius, start_angle: 0, clockwise: false },
});

/** QA-SC-01: 16 marchers move from a 4 x 4 block to a 16-slot circle. */
export function sc01(): TimelineFixture {
    const row = rowBuilder();
    return {
        name: "QA-SC-01",
        description: "baseline: a 4 x 4 block moves to a 16-slot circle",
        show: {
            marchers: block16(),
            shapes: { 1: circle([3, 20], 8) },
            transitions: { 1: tr(1, 0, 16, 1, { slots: 16 }) },
            assignments: Array.from({ length: 16 }, (_, i) =>
                row(i + 1, 1, i, 0, 16),
            ),
        },
    };
}

/**
 * QA-SC-03: 16 marchers march forward 16 counts; at beat 8 the four marchers at each end are
 * stolen by a layer-1 transition.
 */
export function sc03(): TimelineFixture {
    const row = rowBuilder();
    const ends = [1, 2, 3, 4, 13, 14, 15, 16];
    return {
        name: "QA-SC-03",
        description:
            "flutter steal: the four marchers at each end leave at beat 8",
        show: {
            marchers: Array.from({ length: 16 }, (_, i) => ({
                id: i + 1,
                home: [2 * i, 0] as XY,
            })),
            shapes: {
                1: line([
                    [0, 16],
                    [30, 16],
                ]),
                2: line([
                    [-10, 24],
                    [40, 24],
                ]),
            },
            transitions: {
                1: tr(1, 0, 16, 1, { slots: 16 }),
                2: tr(2, 8, 16, 2, { slots: 8 }),
            },
            assignments: [
                ...Array.from({ length: 16 }, (_, i) =>
                    row(i + 1, 1, i, 0, 16),
                ),
                ...ends.map((m, slot) => row(m, 2, slot, 8, 16, 1)),
            ],
        },
    };
}

/** QA-SC-05: a block forms a circle, then follows the leader into a freehand squiggle. */
export function sc05(): TimelineFixture {
    const row = rowBuilder();
    return {
        name: "QA-SC-05",
        description: "follow-the-leader: a circle files into a squiggle",
        show: {
            marchers: block16(),
            shapes: {
                1: circle([0, 20], 8),
                2: line(
                    [
                        [-16, 40],
                        [-8, 48],
                        [0, 40],
                        [8, 48],
                        [16, 40],
                        [24, 48],
                    ],
                    "freehand",
                ),
            },
            transitions: {
                1: tr(1, 0, 8, 1, { slots: 16 }),
                2: tr(2, 8, 24, 2, {
                    slots: 16,
                    style: "follow_the_leader",
                    params: { waypoints: [] },
                }),
            },
            assignments: Array.from({ length: 16 }, (_, i) => [
                row(i + 1, 1, i, 0, 8),
                row(i + 1, 2, i, 8, 24),
            ]).flat(),
        },
    };
}

// ---------------------------------------------------------------------------
// QA-SC-11: scale
// ---------------------------------------------------------------------------

/** The mulberry32 PRNG used by `ref/` and the core's show generators. */
export function mulberry32(seed: number): () => number {
    let a = seed | 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The SC-11 sizes (spec §12.8). Tests pass smaller ones to keep fast checks fast. */
export interface Sc11Size {
    marchers: number;
    /** Groups that move together; each needs 8 to 32 marchers */
    groups: number;
    /** Transitions that carry whole groups */
    groupTransitions: number;
    /** Transitions that hold the layer-1 steals */
    stealTransitions: number;
    timelines: number;
    shapes: number;
    /** Transitions in the deepest chain (group 0's) */
    chainDepth: number;
    /** The fewest transitions any other group gets; every marcher gets at least this many rows */
    minRowsPerMarcher: number;
}

export const SC11_SIZE: Sc11Size = {
    marchers: 250,
    groups: 12,
    groupTransitions: 180,
    stealTransitions: 20,
    timelines: 10,
    shapes: 120,
    chainDepth: 32,
    minRowsPerMarcher: 10,
};

const STEAL_FRACTION = 0.1;
const MIN_SLOTS = 8;
const MAX_SLOTS = 32;

/**
 * QA-SC-11: a seeded show of the spec's scale. With the default size: 250 marchers in 12 groups
 * of 8 to 32, 200 transitions (180 that move a whole group, 20 that hold steals) on 10 timelines,
 * 120 shapes of every kind, styles about 60% direct, 10% arc and 30% follow-the-leader, a
 * 32-transition chain (group 0), at least 10 rows per marcher, and a layer-1 steal over the
 * second half of about 10% of the group rows. The same seed always gives the same show.
 */
// One function keeps the order of PRNG draws easy to follow, which keeps a seed reproducible.
// eslint-disable-next-line max-lines-per-function
export function sc11(
    seed: number,
    size: Sc11Size = SC11_SIZE,
): TimelineFixture {
    const R = mulberry32(seed);
    const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
    const coord = (half: number) => Math.round((R() * 2 - 1) * half * 4) / 4;
    const pt = (): XY => [coord(80), coord(40)];
    const shuffle = <T>(xs: T[]): T[] => {
        for (let i = xs.length - 1; i > 0; i--) {
            const j = Math.floor(R() * (i + 1));
            [xs[i], xs[j]] = [xs[j]!, xs[i]!];
        }
        return xs;
    };

    // Marchers, split into groups of MIN_SLOTS..MAX_SLOTS
    const marchers = Array.from({ length: size.marchers }, (_, i) => ({
        id: i + 1,
        home: pt(),
    }));
    const groupSizes = Array.from({ length: size.groups }, () => MIN_SLOTS);
    if (
        size.marchers < MIN_SLOTS * size.groups ||
        size.marchers > MAX_SLOTS * size.groups
    )
        throw new Error("SC-11: the marchers don't fit the groups");
    for (let left = size.marchers - MIN_SLOTS * size.groups; left > 0; ) {
        const g = Math.floor(R() * size.groups);
        if (groupSizes[g]! < MAX_SLOTS) {
            groupSizes[g]!++;
            left--;
        }
    }
    const groups: number[][] = [];
    for (const n of groupSizes) {
        const first = groups.reduce((sum, g) => sum + g.length, 1);
        groups.push(Array.from({ length: n }, (_, i) => first + i));
    }

    // How many transitions each group gets: group 0 is the deep chain
    const counts = groups.map((_, g) =>
        g === 0 ? size.chainDepth : size.minRowsPerMarcher,
    );
    let extra = size.groupTransitions - counts.reduce((sum, n) => sum + n, 0);
    if (extra < 0) throw new Error("SC-11: too few group transitions");
    while (extra-- > 0) counts[1 + Math.floor(R() * (size.groups - 1))]!++;

    const shapes: Record<number, ShapeRow> = {};
    const transitions: Record<number, TransitionRow> = {};
    const assignments: AssignmentRow[] = [];
    const timelineOf = new Map<number, number>();
    const totalTransitions = size.groupTransitions + size.stealTransitions;
    let shapeCount = 0;
    let transitionCount = 0;

    const pickStyle = (): PathStyle => {
        const r = R();
        return r < 0.6 ? "direct" : r < 0.7 ? "arc" : "follow_the_leader";
    };
    const paramsFor = (style: PathStyle): PathParams | null =>
        style === "arc"
            ? { bulge: Math.round((R() * 2 - 1) * 500) / 1000 }
            : style === "follow_the_leader"
              ? { waypoints: Array.from({ length: ri(0, 2) }, pt) }
              : null;
    const newShape = (slots: number, style: PathStyle): ShapeRow => {
        const kinds =
            style === "follow_the_leader"
                ? (["line", "freehand", "box", "circle"] as const)
                : (["line", "freehand", "box", "circle", "block"] as const);
        const kind = kinds[Math.floor(R() * kinds.length)]!;
        switch (kind) {
            case "line":
                return line([pt(), pt()]);
            case "freehand":
                return line(Array.from({ length: ri(4, 7) }, pt), "freehand");
            case "box":
                return {
                    kind,
                    geometry: {
                        origin: pt(),
                        width: ri(8, 30),
                        height: ri(6, 20),
                    },
                };
            case "circle":
                return {
                    kind,
                    geometry: {
                        center: pt(),
                        radius: ri(4, 20),
                        start_angle: Math.round(R() * 6283) / 1000,
                        clockwise: R() < 0.5,
                    },
                };
            case "block": {
                const cols = Math.ceil(Math.sqrt(slots));
                return {
                    kind,
                    geometry: {
                        origin: pt(),
                        rows: Math.ceil(slots / cols),
                        cols,
                        spacing: [2, 2],
                    },
                };
            }
        }
    };
    /** A new shape until there are enough, else a random earlier one that isn't a block. */
    const shapeFor = (slots: number, style: PathStyle): number => {
        const needed = size.shapes - shapeCount;
        const remaining = totalTransitions - transitionCount;
        if (needed > 0 && (needed >= remaining || R() < 0.6)) {
            const id = ++shapeCount;
            shapes[id] = newShape(slots, style);
            return id;
        }
        const reusable = Object.keys(shapes)
            .map(Number)
            .filter((id) => shapes[id]!.kind !== "block");
        if (reusable.length === 0) {
            const id = ++shapeCount;
            shapes[id] = line([pt(), pt()]);
            return id;
        }
        return reusable[Math.floor(R() * reusable.length)]!;
    };
    const addTransition = (
        start: number,
        end: number,
        slots: number,
        timeline: number,
    ): number => {
        const style = pickStyle();
        const id = ++transitionCount;
        transitions[id] = tr(id, start, end, shapeFor(slots, style), {
            slots,
            style,
            params: paramsFor(style),
            order:
                style === "follow_the_leader" && R() < 0.2 ? "slot" : "inherit",
        });
        timelineOf.set(id, timeline);
        return id;
    };

    // Group transitions: each group moves through its own chain, back to back with a few gaps
    let showEnd = 1;
    groups.forEach((members, g) => {
        let beat = 1;
        for (let k = 0; k < counts[g]!; k++) {
            if (R() < 0.15) beat += ri(1, 4);
            const start = beat;
            const end = start + ri(4, 12);
            const t = addTransition(
                start,
                end,
                members.length,
                g % size.timelines,
            );
            const slots = shuffle(members.map((_, i) => i));
            members.forEach((m, i) =>
                assignments.push({
                    // Ids count up from 1 in push order
                    id: assignments.length + 1,
                    marcher: m,
                    transition: t,
                    slot: slots[i]!,
                    start,
                    end,
                    layer: 0,
                }),
            );
            beat = end;
        }
        showEnd = Math.max(showEnd, beat);
    });

    // Steals: about STEAL_FRACTION of the group rows get a layer-1 row over their second half
    const stolen = assignments
        .filter((a) => R() < STEAL_FRACTION && a.end - a.start >= 2)
        .map((a) => ({
            marcher: a.marcher,
            start: a.start + Math.floor((a.end - a.start) / 2),
            end: a.end,
        }))
        .sort((a, b) => a.start - b.start || a.marcher - b.marcher);
    for (let s = 0; s < size.stealTransitions; s++) {
        const chunk = stolen.slice(
            Math.floor((s * stolen.length) / size.stealTransitions),
            Math.floor(((s + 1) * stolen.length) / size.stealTransitions),
        );
        // One row per marcher in a transition, and no more rows than slots
        const seen = new Set<number>();
        const rows = chunk
            .filter((r) => !seen.has(r.marcher) && seen.add(r.marcher))
            .slice(0, MAX_SLOTS);
        if (rows.length === 0) continue;
        const start = Math.min(...rows.map((r) => r.start));
        const end = Math.max(...rows.map((r) => r.end));
        const t = addTransition(
            start,
            end,
            Math.max(MIN_SLOTS, rows.length),
            s % size.timelines,
        );
        rows.forEach((r, slot) =>
            assignments.push({
                id: assignments.length + 1,
                marcher: r.marcher,
                transition: t,
                slot,
                start: r.start,
                end: r.end,
                layer: 1,
            }),
        );
    }

    const timelines: FixtureTimeline[] = Array.from(
        { length: size.timelines },
        (_, i) => ({
            id: i + 1,
            name: `SC-11 track ${i + 1}`,
            start: 0,
            end: showEnd,
            transitions: [...timelineOf]
                .filter(([, timeline]) => timeline === i)
                .map(([t]) => t),
        }),
    );

    return {
        name: `QA-SC-11 (seed ${seed})`,
        description: `scale: ${size.marchers} marchers, ${transitionCount} transitions, ${shapeCount} shapes`,
        show: { marchers, shapes, transitions, assignments },
        timelines,
    };
}
