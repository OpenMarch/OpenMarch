import { describe, expect, it } from "vitest";
import { FieldProperties, type WorldPoint } from "@openmarch/core";
import type { GeometryChange } from "@openmarch/core";
import {
    outlineShape,
    PIXELS_PER_METER,
    placeOutline,
} from "@/items/itemOutlines";
import FootballTemplates from "@/global/classes/fieldTemplates/Football";
import {
    fakeShowPositions,
    linearTrack,
} from "@/view3d/__test__/fakePositions";
import {
    cachedShapeKey,
    createPropBlockFrame,
    MIN_PROP_HEIGHT,
    placePropBlocks,
    propShapeKey,
    propShapes,
    propTracks,
    writePropMatrix,
    type PropTrack,
} from "../propBlocks";

/** A column-major matrix applied to (x, y, z, 1). */
function apply(
    m: Float32Array,
    index: number,
    x: number,
    y: number,
    z: number,
) {
    const o = index * 16;
    return {
        x: m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12],
        y: m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13],
        z: m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14],
    };
}

const change = (
    over: Partial<GeometryChange> & { beat: number },
): GeometryChange => ({
    outlineType: "rectangle",
    width: 2,
    depth: 1,
    height: 0.5,
    rotation: 0,
    customOutline: null,
    transitionLength: 1,
    rollsOut: false,
    leadingEdge: null,
    ...over,
});

describe("writePropMatrix", () => {
    it("puts a unit footprint's corners where the 2D field draws the Outline", () => {
        const geometry = { width: 4, depth: 2, height: 1.2, rotation: 30 };
        const center = { x: 10, z: -5 };
        const out = new Float32Array(16);
        writePropMatrix(out, 0, geometry, center);
        // The 2D Outline in meters (the same mapping in field units, scaled)
        const shape = outlineShape("rectangle", null, 4, 2);
        const drawn = placeOutline(shape, { x: 10, y: -5 }, 30);
        const unit = outlineShape("rectangle", null, 1, 1).points;
        unit.forEach((p, i) => {
            const world = apply(out, 0, p.x, 0, p.y);
            expect(world.x).toBeCloseTo(drawn[i].x, 6);
            expect(world.z).toBeCloseTo(drawn[i].y, 6);
            expect(world.y).toBeCloseTo(0, 6);
        });
        expect(apply(out, 0, 0, 1, 0).y).toBeCloseTo(1.2, 6);
    });

    it("turns clockwise on screen: +X toward +Z (toward the audience)", () => {
        const out = new Float32Array(16);
        writePropMatrix(
            out,
            0,
            { width: 1, depth: 1, height: 1, rotation: 90 },
            { x: 0, z: 0 },
        );
        const tip = apply(out, 0, 1, 0, 0);
        expect(tip.x).toBeCloseTo(0, 6);
        expect(tip.z).toBeCloseTo(1, 6);
    });

    it("draws a Floor prop (no height) as a thin slab on the base", () => {
        const out = new Float32Array(32);
        writePropMatrix(
            out,
            1,
            { width: 1, depth: 1, height: 0, rotation: 0 },
            { x: 0, z: 0 },
            0.02,
        );
        expect(apply(out, 1, 0, 0, 0).y).toBeCloseTo(0.02, 6);
        expect(apply(out, 1, 0, 1, 0).y).toBeCloseTo(0.02 + MIN_PROP_HEIGHT, 6);
    });
});

describe("propShapeKey and propShapes", () => {
    const triangle = {
        points: [
            { x: 0, y: -0.5 },
            { x: 0.5, y: 0.5 },
            { x: -0.5, y: 0.5 },
        ],
    };

    it("shares one footprint across rectangles and across circles, whatever their size", () => {
        expect(propShapeKey("rectangle", null)).toBe("rectangle");
        expect(propShapeKey("circle", null)).toBe("circle");
    });

    it("gives a custom outline its own footprint, and an unusable one a rectangle", () => {
        expect(propShapeKey("polygon", triangle)).not.toBe("rectangle");
        expect(propShapeKey("polygon", triangle)).toBe(
            propShapeKey("polygon", JSON.parse(JSON.stringify(triangle))),
        );
        expect(propShapeKey("polygon", null)).toBe("rectangle");
        expect(propShapeKey("polygon", { points: [{ x: 0, y: 0 }] })).toBe(
            "rectangle",
        );
    });

    it("lists every footprint a show uses, once each, with unit polygons", () => {
        const tracks = propTracks(
            new Map([
                [
                    11,
                    [
                        change({ beat: 0 }),
                        change({
                            beat: 4,
                            outlineType: "polygon",
                            customOutline: triangle,
                        }),
                    ],
                ],
                [12, [change({ beat: 0 })]],
            ]),
        );
        const shapes = propShapes(tracks);
        expect(shapes.map((s) => s.key)).toHaveLength(2);
        const rect = shapes.find((s) => s.key === "rectangle")!;
        expect(rect.footprint).toHaveLength(4);
        const poly = shapes.find((s) => s.key !== "rectangle")!;
        expect(poly.footprint).toEqual(triangle.points);
    });
});

describe("propTracks", () => {
    it("sorts each prop's changes by beat, and props by marcher id", () => {
        const tracks = propTracks(
            new Map([
                [
                    70,
                    [
                        change({ beat: 5, width: 3 }),
                        change({ beat: 1, width: 1 }),
                    ],
                ],
                [20, [change({ beat: 0 })]],
            ]),
        );
        expect(tracks.map((t) => t.marcherId)).toEqual([20, 70]);
        expect(tracks[1].changes.map((c) => [c.beat, c.width])).toEqual([
            [1, 1],
            [5, 3],
        ]);
    });
});

describe("placePropBlocks", () => {
    const tracks: PropTrack[] = propTracks(
        new Map([
            [
                1,
                [
                    // On field from beat 1, turns to 90 degrees over 4 counts to beat 6
                    change({ beat: 1, rotation: 0 }),
                    change({ beat: 6, rotation: 90, transitionLength: 4 }),
                ],
            ],
            // A circle, on field from beat 4
            [2, [change({ beat: 4, outlineType: "circle" })]],
        ]),
    );
    const keys = propShapes(tracks).map((s) => s.key);
    const at = (x: number, z: number) => (_: number, out: WorldPoint) => {
        out.x = x;
        out.z = z;
        return true;
    };

    it("leaves a prop out before its first change (Off field)", () => {
        const frame = createPropBlockFrame(keys, 2);
        placePropBlocks(tracks, 2, at(0, 0), frame, cachedShapeKey());
        expect(frame.counts[keys.indexOf("rectangle")]).toBe(1);
        expect(frame.counts[keys.indexOf("circle")]).toBe(0);
    });

    it("eases a turn as the 2D Outline does", () => {
        const frame = createPropBlockFrame(keys, 2);
        const k = keys.indexOf("rectangle");
        // Transition from beat 3 to beat 6: halfway at 4.5, in place at 6
        placePropBlocks(tracks, 4.5, at(0, 0), frame, cachedShapeKey());
        const half = apply(frame.matrices[k], 0, 1, 0, 0);
        expect(Math.atan2(half.z, half.x)).toBeCloseTo(Math.PI / 4, 6);
        placePropBlocks(tracks, 6, at(0, 0), frame, cachedShapeKey());
        const done = apply(frame.matrices[k], 0, 1, 0, 0);
        expect(Math.atan2(done.z, done.x)).toBeCloseTo(Math.PI / 2, 6);
    });

    it("skips a prop without a position", () => {
        const frame = createPropBlockFrame(keys, 2);
        placePropBlocks(tracks, 5, () => false, frame, cachedShapeKey());
        expect([...frame.counts]).toEqual([0, 0]);
    });

    it("follows the show's positions at a time, through ShowPositions", () => {
        const fieldProperties =
            FootballTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
        const from = {
            x: fieldProperties.centerFrontPoint.xPixels,
            y: fieldProperties.centerFrontPoint.yPixels,
        };
        const to = { x: from.x + PIXELS_PER_METER * 10, y: from.y };
        const positions = fakeShowPositions(
            new Map([
                [1, linearTrack(from, to, 0, 10_000)],
                [2, linearTrack(from, from)],
            ]),
        );
        const ms = 5000;
        const frame = createPropBlockFrame(keys, 2);
        placePropBlocks(
            tracks,
            // The fake show's beats aren't the props' beats; any on-field beat
            7,
            (id, out) => positions.positionInto(id, ms, fieldProperties, out),
            frame,
            cachedShapeKey(),
        );
        const k = keys.indexOf("rectangle");
        const center = apply(frame.matrices[k], 0, 0, 0, 0);
        const expected = positions.positionAt(1, ms, fieldProperties)!;
        expect(center.x).toBeCloseTo(expected.x, 4);
        expect(center.z).toBeCloseTo(expected.z, 4);
        expect(expected.x).toBeGreaterThan(0);
        expect(positions.beatAt(ms)).toBeGreaterThan(1);
    });
});

// The meter mapping the 2D field uses for Outline sizes
it("stores Outline sizes in meters (PIXELS_PER_METER)", () => {
    expect(PIXELS_PER_METER).toBeCloseTo(
        FieldProperties.PIXELS_PER_INCH / 0.0254,
    );
});
