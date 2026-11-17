import { describe, expect, it } from "vitest";
import type { GeometryChange } from "@openmarch/core";
import { carryForSection } from "@/view3d/core/instruments/catalog";
import {
    NOT_PLAYING,
    assignPlayers,
    playingHeading,
    playingSpotsAt,
    writePlayers,
    type PlayedInstrumentInput,
} from "../pitPlayers";
import {
    PLAYING_SPOT_STANDOFF_M,
    PLAYING_SPOT_TOLERANCE_M,
    playingSpotOf,
} from "../playingSpot";

const DEPTH = 1.2;
const BACK = DEPTH / 2 + PLAYING_SPOT_STANDOFF_M;

const changes = (rotation = 0): GeometryChange[] => [
    {
        beat: 0,
        outlineType: "rectangle",
        customOutline: null,
        width: 2.8,
        depth: DEPTH,
        height: 1,
        rotation,
        transitionLength: 1,
        rollsOut: false,
        leadingEdge: null,
    },
];

const instrument = (
    id: number,
    model = "pit/marimba-5.0",
    rotation = 0,
): PlayedInstrumentInput => ({ id, model, changes: changes(rotation) });

/** Every item at its own center */
const at =
    (centers: Record<number, { x: number; z: number }>) => (id: number) =>
        centers[id] ?? null;

const assign = (
    spots: ReturnType<typeof playingSpotsAt>,
    dots: [number, number][],
    placed = dots.map(() => 1),
) => {
    const xz = new Float32Array(dots.flat());
    const out = new Int32Array(dots.length);
    const count = assignPlayers(spots, xz, new Uint8Array(placed), out);
    return { out: [...out], count, xz };
};

describe("playingSpotsAt", () => {
    it("puts a spot on the field side of each played instrument, where the timeline has it", () => {
        const spots = playingSpotsAt(
            [instrument(1), instrument(2, "pit/vibraphone-3.0-gold", 180)],
            0,
            at({ 1: { x: 0, z: 10 }, 2: { x: 5, z: -40 } }),
        );
        expect(spots).toHaveLength(2);
        expect(spots[0].x).toBeCloseTo(0);
        expect(spots[0].y).toBeCloseTo(10 - BACK);
        // Turned 180: the spot is on its +z side
        expect(spots[1].x).toBeCloseTo(5);
        expect(spots[1].y).toBeCloseTo(-40 + BACK);
    });

    it("ignores items nobody plays and items the timeline has nowhere", () => {
        const spots = playingSpotsAt(
            [
                instrument(1, "pit/speaker-tall"),
                instrument(2, "pit/mixer-cart-covered"),
                instrument(3, "pit/conductor-podium"),
                instrument(4),
            ],
            0,
            at({ 1: { x: 0, z: 0 }, 2: { x: 0, z: 0 }, 3: { x: 0, z: 0 } }),
        );
        expect(spots).toEqual([]);
    });

    it("matches the 2D spot exactly", () => {
        const [spot] = playingSpotsAt(
            [instrument(1, "pit/marimba-5.0", 33)],
            0,
            at({ 1: { x: 3, z: 12 } }),
        );
        expect(spot).toEqual(
            playingSpotOf("pit/marimba-5.0", {
                center: { x: 3, y: 12 },
                depth: DEPTH,
                rotation: 33,
            }),
        );
    });
});

describe("assignPlayers", () => {
    const [spot] = playingSpotsAt(
        [instrument(1)],
        0,
        at({ 1: { x: 0, z: 10 } }),
    );
    const spotY = 10 - BACK;

    it("has a dot on the spot play it", () => {
        const { out, count } = assign([spot], [[0.1, spotY - 0.1]]);
        expect(out).toEqual([0]);
        expect(count).toBe(1);
    });

    it("leaves a dot just outside the tolerance alone", () => {
        const { out, count } = assign(
            [spot],
            [[0, spotY - PLAYING_SPOT_TOLERANCE_M - 0.01]],
        );
        expect(out).toEqual([NOT_PLAYING]);
        expect(count).toBe(0);
    });

    it("has the nearest of two dots on one spot play it, and leaves the other", () => {
        const { out, count } = assign(
            [spot],
            [
                [0.2, spotY],
                [0.05, spotY],
                [-0.15, spotY],
            ],
        );
        expect(out).toEqual([NOT_PLAYING, 0, NOT_PLAYING]);
        expect(count).toBe(1);
    });

    it("skips dots that aren't placed", () => {
        const { out } = assign(
            [spot],
            [
                [0, spotY],
                [0.1, spotY],
            ],
            [0, 1],
        );
        expect(out).toEqual([NOT_PLAYING, 0]);
    });

    it("finds the spot of a turned instrument by its turn", () => {
        const [turned] = playingSpotsAt(
            [instrument(1, "pit/marimba-5.0", 90)],
            0,
            at({ 1: { x: 0, z: 10 } }),
        );
        // Turned a quarter clockwise: the field side is +x
        const { out } = assign(
            [turned],
            [
                [0, spotY],
                [BACK, 10],
            ],
        );
        expect(out).toEqual([NOT_PLAYING, 0]);
    });

    it("has a dot on two overlapping spots play the nearer", () => {
        const spots = playingSpotsAt(
            [instrument(1), instrument(2)],
            0,
            at({ 1: { x: 0, z: 10 }, 2: { x: 0.4, z: 10 } }),
        );
        const { out, count } = assign(spots, [[0.3, spotY]]);
        expect(out).toEqual([1]);
        expect(count).toBe(1);
    });
});

describe("playingHeading", () => {
    const spot = (facing: number) => ({ x: 0, y: 0, facing, reach: 0.3 });

    it("faces an unturned instrument's player toward the audience", () => {
        expect(playingHeading(spot(0))).toBe(0);
    });

    it("faces the way the instrument's model faces", () => {
        // A heading h faces (sin h, cos h); the model's front turns to (-sin r, cos r)
        for (const r of [33, 90, 180, 270, -45]) {
            const h = playingHeading(spot(r));
            const radians = (r * Math.PI) / 180;
            expect(Math.sin(h)).toBeCloseTo(-Math.sin(radians));
            expect(Math.cos(h)).toBeCloseTo(Math.cos(radians));
        }
    });

    it("faces a player behind an instrument turned 180 toward the back sideline", () => {
        expect(Math.cos(playingHeading(spot(180)))).toBeCloseTo(-1);
    });
});

describe("writePlayers", () => {
    it("snaps players onto their spot facing the instrument, and leaves everyone else", () => {
        const spots = playingSpotsAt(
            [instrument(1), instrument(2, "pit/marimba-5.0", 180)],
            0,
            at({ 1: { x: 0, z: 10 }, 2: { x: 20, z: -40 } }),
        );
        const xz = new Float32Array([
            0.1,
            10 - BACK + 0.2,
            7,
            7,
            20.2,
            -40 + BACK,
        ]);
        const headings = new Float32Array([0.5, 0.5, 0.5]);
        writePlayers(spots, new Int32Array([0, NOT_PLAYING, 1]), xz, headings);
        expect([...xz].map((v) => +v.toFixed(3))).toEqual([
            0,
            +(10 - BACK).toFixed(3),
            7,
            7,
            20,
            +(-40 + BACK).toFixed(3),
        ]);
        expect(headings[0]).toBe(0);
        expect(headings[1]).toBeCloseTo(0.5);
        expect(Math.cos(headings[2])).toBeCloseTo(-1);
    });
});

describe("pit sections", () => {
    it("carry nothing", () => {
        for (const section of [
            "Marimba",
            "Vibraphone",
            "Xylophone",
            "Aux Percussion",
            "Synthesizer",
        ])
            expect(carryForSection(section), section).toBeNull();
    });
});
