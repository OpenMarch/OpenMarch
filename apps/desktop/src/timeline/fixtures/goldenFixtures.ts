import type { TimelineSnapshot, XY } from "@openmarch/core";
import { line, P, rowBuilder, tr, type TimelineFixture } from "./fixtureTypes";

/**
 * The golden vectors G1 to G13 (spec §12.4) as loadable fixtures. They are the same shows as the
 * core's golden tests (`packages/core/src/timeline/__test__/fixtures.ts`), with the same ids, so
 * the spec's expected positions apply to them directly once the loader's id maps are applied.
 * G7 is G6 with T1's shape already moved, and G8b is G8's negative-bulge row.
 */

const oneMarcher = (
    shapes: TimelineSnapshot["shapes"],
    transitions: TimelineSnapshot["transitions"],
    assignments: TimelineSnapshot["assignments"],
): TimelineSnapshot => ({
    marchers: [{ id: 1, home: [0, 0] }],
    shapes,
    transitions,
    assignments,
});

/** G6's show: a line (T1) then follow-the-leader (T2) with the slots reversed on purpose. */
const g6 = (upstream: XY[]): TimelineSnapshot => {
    const row = rowBuilder();
    return {
        marchers: [1, 2, 3, 4].map((id, i) => ({
            id,
            home: [2 * i, 0] as XY,
        })),
        shapes: {
            1: line(upstream),
            2: line([
                [6, 2],
                [6, 8],
            ]),
        },
        transitions: {
            1: tr(1, 0, 4, 1, { slots: 4 }),
            2: tr(2, 4, 12, 2, {
                slots: 4,
                style: "follow_the_leader",
                params: { waypoints: [] },
            }),
        },
        assignments: [1, 2, 3, 4].flatMap((m, i) => [
            row(m, 1, i, 0, 4),
            row(m, 2, 3 - i, 4, 12),
        ]),
    };
};

const g6Flat = () =>
    g6([
        [0, 0],
        [6, 0],
    ]);

const arc = (bulge: number): TimelineSnapshot => {
    const row = rowBuilder();
    return oneMarcher(
        { 1: P(8, 0) },
        { 1: tr(1, 0, 8, 1, { style: "arc", params: { bulge } }) },
        [row(1, 1, 0, 0, 8)],
    );
};

const golden = (
    name: string,
    description: string,
    show: () => TimelineSnapshot,
): { name: string; build: () => TimelineFixture } => ({
    name,
    build: () => ({ name, description, show: show() }),
});

export const GOLDEN_FIXTURES = [
    golden("G1", "baseline: one direct move", () => {
        const row = rowBuilder();
        return oneMarcher({ 1: P(16, 0) }, { 1: tr(1, 0, 16, 1) }, [
            row(1, 1, 0, 0, 16),
        ]);
    }),
    golden("G2", "flutter steal: a layer-1 row takes over at beat 8", () => {
        const row = rowBuilder();
        return oneMarcher(
            { 1: P(16, 0), 2: P(8, 8) },
            { 1: tr(1, 0, 16, 1), 2: tr(2, 8, 16, 2) },
            [row(1, 1, 0, 0, 16, 0), row(1, 2, 0, 8, 16, 1)],
        );
    }),
    golden("G3", "stacked steals with resumes over three layers", () => {
        const row = rowBuilder();
        return oneMarcher(
            { 1: P(16, 0), 2: P(4, 8), 3: P(10, 10) },
            { 1: tr(1, 0, 16, 1), 2: tr(2, 4, 12, 2), 3: tr(3, 6, 10, 3) },
            [
                row(1, 1, 0, 0, 16, 0),
                row(1, 2, 0, 4, 12, 1),
                row(1, 3, 0, 6, 10, 2),
            ],
        );
    }),
    golden("G4", "a gap holds between two moves", () => {
        const row = rowBuilder();
        return oneMarcher(
            { 1: P(8, 0), 2: P(8, 8) },
            { 1: tr(1, 0, 8, 1), 2: tr(2, 12, 20, 2) },
            [row(1, 1, 0, 0, 8), row(1, 2, 0, 12, 20)],
        );
    }),
    golden("G5", "a join into a direct transition rebases from home", () => {
        const row = rowBuilder();
        return {
            marchers: [{ id: 2, home: [0, 0] }],
            shapes: { 1: P(0, 16) },
            transitions: { 1: tr(1, 0, 16, 1) },
            assignments: [row(2, 1, 0, 8, 16)],
        };
    }),
    golden("G6", "follow-the-leader inherits its order", g6Flat),
    golden("G7", "G6 with the upstream line moved to y = -4", () =>
        g6([
            [0, -4],
            [6, -4],
        ]),
    ),
    golden("G8", "a semicircle arc (bulge 1/2)", () => arc(0.5)),
    golden("G8b", "an arc with a negative bulge", () => arc(-0.125)),
    golden("G9", "follow-the-leader with a vacant slot", () => {
        const show = g6Flat();
        show.marchers = show.marchers.slice(1);
        show.assignments = show.assignments.filter((r) => r.marcher !== 1);
        return show;
    }),
    golden("G10", "follow-the-leader falls back to slot order", () => {
        const show = g6Flat();
        show.shapes[3] = P(0, 0);
        show.transitions[3] = tr(3, 0, 4, 3);
        show.assignments = show.assignments.filter(
            (r) => !(r.marcher === 1 && r.transition === 1),
        );
        show.assignments.push({
            id: 100,
            marcher: 1,
            transition: 3,
            slot: 0,
            start: 0,
            end: 4,
            layer: 0,
        });
        return show;
    }),
    golden("G11", "a late joiner of follow-the-leader is not a founder", () => {
        const show = g6Flat();
        show.assignments = show.assignments.map((r) =>
            r.marcher === 1 && r.transition === 2 ? { ...r, start: 8 } : r,
        );
        return show;
    }),
    golden(
        "G12",
        "the follow-the-leader leader is stolen, then resumes",
        () => {
            const show = g6Flat();
            show.shapes[5] = P(10, 10);
            show.transitions[5] = tr(5, 6, 8, 5);
            show.assignments.push({
                id: 100,
                marcher: 4,
                transition: 5,
                slot: 0,
                start: 6,
                end: 8,
                layer: 1,
            });
            return show;
        },
    ),
    golden("G13", "individual moves mixed with a shape", () => {
        const row = rowBuilder();
        return {
            marchers: [1, 2, 3].map((id) => ({ id, home: [0, 0] as XY })),
            shapes: {
                1: line([
                    [0, 10],
                    [8, 10],
                ]),
            },
            transitions: {
                1: tr(1, 0, 8, null, {
                    points: [
                        [4, 4],
                        [-2, 6],
                        [10, 0],
                    ],
                    slots: 3,
                }),
                2: tr(2, 8, 16, 1, { slots: 3 }),
                3: tr(3, 16, 24, null, {
                    points: [[8, 18]],
                    style: "arc",
                    params: { bulge: 0.5 },
                }),
                4: tr(4, 12, 16, null, { points: [[20, 20]] }),
            },
            assignments: [
                row(1, 1, 0, 0, 8),
                row(2, 1, 1, 0, 8),
                row(3, 1, 2, 0, 8),
                row(1, 2, 0, 8, 16),
                row(2, 2, 1, 8, 16),
                row(3, 2, 2, 8, 16),
                row(3, 3, 0, 16, 24),
                row(2, 4, 0, 12, 16, 1),
            ],
        };
    }),
];
