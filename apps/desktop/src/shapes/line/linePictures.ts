import type {
    ToolChoicePicture,
    ToolChoicePictureLine,
} from "../tool/toolKind";
import type { XY } from "../types";
import {
    lineOutline,
    type LineMeasure,
    type LineParams,
    type LinePoint,
} from "./lineGeometry";
import { lineFillSpots } from "./lineFill";

/**
 * The Line's menu pictures (#559): a small sample line laid out with each answer by the Line's own
 * geometry, so a picture shows what the answer does rather than an icon for it. Each menu's
 * pictures share one sample, so only the answer changes between them. Everything here is pure; the
 * pictures are worked out once.
 */

const corner = (x: number, y: number): LinePoint => ({ x, y, tension: 0 });

/**
 * The line drawn through `p`, light under its marchers as the Line lays them out, and any extra
 * lines. With no marchers the line is the picture, drawn full.
 */
function sketch(
    p: LineParams,
    n: number,
    extra: readonly ToolChoicePictureLine[] = [],
): ToolChoicePicture {
    return {
        lines: [
            {
                points: lineOutline(p),
                ...(p.closed ? { closed: true } : {}),
                ...(n > 0 ? { faint: true } : {}),
            },
            ...extra,
        ],
        dots: lineFillSpots(p, n).map(({ x, y }): XY => ({ x, y })),
    };
}

const once = <T>(make: () => T): (() => T) => {
    let made: T | undefined;
    return () => (made ??= make());
};

/** Open or closed: the same four points, joined back or not */
export const endsPictures = once(() => {
    const points = [corner(0, 12), corner(4, 0), corner(16, 0), corner(20, 12)];
    return {
        open: sketch({ points, spacing: { mode: "fit" } }, 6),
        closed: sketch({ points, closed: true, spacing: { mode: "fit" } }, 8),
    };
});

/** A short tick across a straight line along x at `x`: where the line ends */
const endTick = (x: number): ToolChoicePictureLine => ({
    points: [
        { x, y: -1.5 },
        { x, y: 1.5 },
    ],
});

/**
 * Spacing on one straight line: Fit spreads the marchers from end to end, Keep interval keeps
 * their spacing so the line grows (dashed) or shrinks with them, and Interval on the path lays
 * them at their interval from the start, the center or the end of a longer line.
 */
export const spacingPictures = once(() => {
    const LENGTH = 24;
    const straight = (to: number): LinePoint[] => [corner(0, 0), corner(to, 0)];
    const path = (anchor: "start" | "center" | "end") =>
        sketch(
            {
                points: straight(LENGTH),
                spacing: { mode: "path", groups: [{ interval: 3 }], anchor },
            },
            4,
            [endTick(0), endTick(LENGTH)],
        );
    return {
        fit: sketch({ points: straight(LENGTH), spacing: { mode: "fit" } }, 5, [
            endTick(0),
            endTick(LENGTH),
        ]),
        keep: sketch(
            {
                points: straight(16),
                spacing: { mode: "keep", groups: [{ interval: 4 }] },
            },
            5,
            [
                {
                    points: [
                        { x: 16, y: 0 },
                        { x: LENGTH, y: 0 },
                    ],
                    dashed: true,
                },
            ],
        ),
        "path-start": path("start"),
        "path-center": path("center"),
        "path-end": path("end"),
    };
});

/**
 * What the interval measures, on a line that bends from steep to shallow: along the path traces the
 * line itself between the marchers, evenly along it; straight across joins each pair of neighbors
 * in a straight line, evenly apart that way; ↔ evens their side-to-side gaps (light lines up and
 * down through each), so they spread out on the steep part; ↕ evens their front-to-back gaps
 * (light lines across), so they spread out on the shallow part. Offset, on a straight line of its
 * own, draws each step's side-to-side and front-to-back parts.
 */
export const measuredPictures = once(() => {
    const points = [corner(0, 0), { x: 4, y: 10, tension: 1 }, corner(22, 14)];
    const n = 6;
    const guides = (p: LineParams, axis: "x" | "y"): ToolChoicePictureLine[] =>
        lineFillSpots(p, n).map(({ x, y }) => ({
            points:
                axis === "x"
                    ? [
                          { x, y: 0 },
                          { x, y: 14 },
                      ]
                    : [
                          { x: 0, y },
                          { x: 22, y },
                      ],
            faint: true,
        }));
    // Straight from each marcher to the next
    const chords = (p: LineParams): ToolChoicePictureLine[] => {
        const spots = lineFillSpots(p, n);
        return spots.slice(1).map((b, i) => ({
            points: [
                { x: spots[i]!.x, y: spots[i]!.y },
                { x: b.x, y: b.y },
            ],
        }));
    };
    const measured = (measure?: LineMeasure) => {
        const p: LineParams = {
            points,
            spacing: { mode: "fit" },
            ...(measure ? { measured: measure } : {}),
        };
        const extra =
            measure === "x" || measure === "y"
                ? guides(p, measure)
                : measure === "straight"
                  ? chords(p)
                  : [{ points: lineOutline(p) }];
        return sketch(p, n, extra);
    };
    // An offset is only on a one-segment line: a straight diagonal, each step from one marcher
    // to the next drawn as its side-to-side then front-to-back parts
    const offset = () => {
        const p: LineParams = {
            points: [corner(0, 2), corner(20, 12)],
            spacing: { mode: "fit" },
            measured: "offset",
            offset: { x: 5, y: 2.5 },
        };
        const spots = lineFillSpots(p, 5);
        const steps = spots.slice(1).map(
            (b, i): ToolChoicePictureLine => ({
                points: [
                    { x: spots[i]!.x, y: spots[i]!.y },
                    { x: b.x, y: spots[i]!.y },
                    { x: b.x, y: b.y },
                ],
            }),
        );
        return sketch(p, 5, steps);
    };
    return {
        along: measured(),
        straight: measured("straight"),
        x: measured("x"),
        y: measured("y"),
        offset: offset(),
    };
});

/** The corners switch on an L: a marcher on the corner, or the run going round it */
export const cornersPictures = once(() => {
    const points = [corner(0, 0), corner(0, 9), corner(15, 9)];
    const of = (corners: boolean) =>
        sketch(
            {
                points,
                spacing: { mode: "fit" },
                ...(corners ? {} : { corners: false }),
            },
            5,
        );
    return { on: of(true), off: of(false) };
});
