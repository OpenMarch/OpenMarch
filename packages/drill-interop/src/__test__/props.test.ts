import { describe, it, expect } from "vitest";
import {
    discoverMarkers,
    isLikelyPropPosition,
    isLikelyReferenceMarker,
} from "../props";
import type { DrillGrid } from "../types";

/** The standard high-school sample grid (1.6 steps/unit, front sideline +26.25). */
const SAMPLE_GRID: DrillGrid = {
    border: { minX: -50, minY: -26.25, maxX: 50, maxY: 26.25 },
    stepsPerUnitX: 1.6,
    stepsPerUnitY: 1.6,
    sidelinesY: [-26.25, 26.25],
    hashesY: [-8.75, 8.75],
    yardLinesX: [],
    measurementSystem: "imperial",
};

describe("isLikelyReferenceMarker", () => {
    it("flags sideline and endline ticks", () => {
        expect(isLikelyReferenceMarker({ x: 0, y: 26.25 }, SAMPLE_GRID)).toBe(
            true,
        );
        expect(isLikelyReferenceMarker({ x: -20, y: 26.25 }, SAMPLE_GRID)).toBe(
            true,
        );
        expect(isLikelyReferenceMarker({ x: -50, y: 0 }, SAMPLE_GRID)).toBe(
            true,
        );
    });

    it("flags center reference dots and near-sideline arcs", () => {
        expect(
            isLikelyReferenceMarker({ x: -3.75, y: 1.25 }, SAMPLE_GRID),
        ).toBe(true);
        expect(
            isLikelyReferenceMarker({ x: -5.2, y: 25.01 }, SAMPLE_GRID),
        ).toBe(true);
    });

    it("does not flag interior prop positions", () => {
        expect(
            isLikelyReferenceMarker({ x: 13.31, y: -6.67 }, SAMPLE_GRID),
        ).toBe(false);
        expect(isLikelyReferenceMarker({ x: -35, y: 8.75 }, SAMPLE_GRID)).toBe(
            false,
        );
        expect(isLikelyPropPosition({ x: 13.31, y: -6.67 }, SAMPLE_GRID)).toBe(
            true,
        );
        expect(isLikelyPropPosition({ x: 5, y: 22.5 }, SAMPLE_GRID)).toBe(
            false,
        );
    });

    it("does not flag a prop parked out on a yard line near a sideline", () => {
        // Yorktown: a prop on the 35, 8 steps in from the back sideline. The
        // yard-number band it used to fall in only ever holds reference ticks
        // within ~14 steps of center; this sits at 24.
        const onThe35 = { x: 15, y: 21.25 };
        expect(isLikelyReferenceMarker(onThe35, SAMPLE_GRID)).toBe(false);
        expect(isLikelyPropPosition(onThe35, SAMPLE_GRID)).toBe(true);
    });

    it("treats a prop staged behind a sideline as a prop", () => {
        // Backdrops and pit equipment legitimately stand off the field. This one
        // is on the 50, three steps behind the back sideline.
        const behindTheLine = { x: 0, y: 28.125 };
        expect(isLikelyReferenceMarker(behindTheLine, SAMPLE_GRID)).toBe(false);
        expect(isLikelyPropPosition(behindTheLine, SAMPLE_GRID)).toBe(true);
    });

    it("still flags reference ticks that hug a sideline from outside", () => {
        // Jack Britt draws yard-number ticks exactly one step past the line
        // (26.25 + 0.625 units). Geometry, not props.
        expect(isLikelyReferenceMarker({ x: 10, y: 26.875 }, SAMPLE_GRID)).toBe(
            true,
        );
    });

    it("separates an outside tick from an off-field prop by ~2 steps", () => {
        // The whole window: a tick sits 1 step past the line, a staged prop 3.
        // Documented as a test because it is the tightest margin in the
        // classifier — if a show puts a prop 2 steps off the back sideline,
        // this is where it will be misread.
        const oneStepOut = { x: 10, y: 26.875 };
        const threeStepsOut = { x: 0, y: 28.125 };
        expect(isLikelyReferenceMarker(oneStepOut, SAMPLE_GRID)).toBe(true);
        expect(isLikelyReferenceMarker(threeStepsOut, SAMPLE_GRID)).toBe(false);
    });
});

describe("discoverMarkers", () => {
    /** One frame per set boundary, all markers static. */
    const framesFor = (
        markers: { id: string; groupId?: string; x: number; y: number }[],
    ) =>
        [0, 1].map(() => ({
            records: new Map(
                markers.map((m) => [
                    m.id,
                    {
                        id: m.id,
                        symbol: "X",
                        point: { x: m.x, y: m.y },
                        groupId: m.groupId,
                    },
                ]),
            ),
        }));

    it("keeps a placed group whole when only some members read as props", () => {
        // A platform line crossing the field: the middle unit lands on the
        // center reference dot's coordinates and the far end runs past the
        // prop-margin band, but all seven were placed as one object.
        const line = [
            { x: -30, y: 21.25 },
            { x: -22.5, y: 16.25 },
            { x: -15, y: 11.25 },
            { x: -7.5, y: 6.25 },
            { x: 0, y: 1.25 },
            { x: 7.5, y: -3.75 },
            { x: 15, y: -8.75 },
        ].map((p, i) => ({ id: String(100 + i), groupId: "abc", ...p }));

        const { props } = discoverMarkers(
            framesFor(line),
            new Set<string>(),
            SAMPLE_GRID,
            [0, 1],
        );
        expect(props).toHaveLength(7);
    });

    it("still drops a group where nothing reads as a prop", () => {
        // Sideline ticks placed as one action.
        const ticks = [-20, -17.5, -15, -12.5].map((x, i) => ({
            id: String(200 + i),
            groupId: "def",
            x,
            y: 26.25,
        }));

        const { props } = discoverMarkers(
            framesFor(ticks),
            new Set<string>(),
            SAMPLE_GRID,
            [0, 1],
        );
        expect(props).toHaveLength(0);
    });

    it("does not spread a verdict between separate groups", () => {
        const markers = [
            { id: "300", groupId: "prop", x: 13.31, y: -6.67 },
            { id: "301", groupId: "ref", x: 0, y: 1.25 },
        ];

        const { props } = discoverMarkers(
            framesFor(markers),
            new Set<string>(),
            SAMPLE_GRID,
            [0, 1],
        );
        expect(props.map((p) => p.id)).toEqual(["300"]);
    });
});
