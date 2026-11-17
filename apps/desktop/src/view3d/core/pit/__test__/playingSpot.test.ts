import { describe, expect, it } from "vitest";
import {
    PLAYING_SPOT_STANDOFF_M,
    PLAYING_SPOT_TOLERANCE_M,
    isOnPlayingSpot,
    isPlayedPitModel,
    playingSpotOf,
} from "../playingSpot";

const FOOT = 0.3048;

describe("isPlayedPitModel", () => {
    it("is true for the pit's instruments", () => {
        for (const id of [
            "pit/marimba-5.0",
            "pit/vibraphone-3.0-gold",
            "pit/synth-88",
            "pit/drum-set",
            "pit/aux-rack-mixed",
            "pit/timpani-26",
            "pit/chimes",
            "pit/gong-36",
            "pit/trap-table",
        ])
            expect(isPlayedPitModel(id), id).toBe(true);
    });

    it("is false for speakers, the mixer, podiums, amps and no model", () => {
        for (const id of [
            "pit/speaker-tall",
            "pit/speaker-wide",
            "pit/mixer-cart-covered",
            "pit/conductor-podium",
            "pit/conductor-podium-tall",
            "pit/amp-bass",
            "pit/podium-tower-4ft",
            "pit/scaffold-tower",
            "pit/not-a-model",
            "props/riser",
            null,
            undefined,
        ])
            expect(isPlayedPitModel(id), String(id)).toBe(false);
    });
});

describe("playingSpotOf", () => {
    const marimba = {
        center: { x: 10, y: 20 },
        depth: 1,
        rotation: 0,
    };

    it("puts the player on the field side, centered, about a foot behind the footprint", () => {
        expect(PLAYING_SPOT_STANDOFF_M).toBeCloseTo(FOOT);
        const spot = playingSpotOf("pit/marimba-5.0", marimba)!;
        // +y is toward the audience, so the field side is -y
        expect(spot.x).toBeCloseTo(10);
        expect(spot.y).toBeCloseTo(20 - 0.5 - FOOT);
        // Facing the audience, as the instrument does
        expect(spot.facing).toBe(0);
    });

    it("turns with the item", () => {
        // A quarter turn (as the field turns Outlines): the field side is toward +x
        const quarter = playingSpotOf("pit/marimba-5.0", {
            ...marimba,
            rotation: 90,
        })!;
        expect(quarter.x).toBeCloseTo(10 + 0.5 + FOOT);
        expect(quarter.y).toBeCloseTo(20);
        expect(quarter.facing).toBe(90);

        const half = playingSpotOf("pit/marimba-5.0", {
            ...marimba,
            rotation: 180,
        })!;
        expect(half.x).toBeCloseTo(10);
        expect(half.y).toBeCloseTo(20 + 0.5 + FOOT);
    });

    it("puts the spot on the field side of an item turned to face the field from behind it", () => {
        // A long instrument behind the back sideline, turned 180: the field is +y from it
        const turned = playingSpotOf("pit/marimba-5.0", {
            center: { x: 10, y: -20 },
            depth: 1.2,
            rotation: 180,
        })!;
        expect(turned.x).toBeCloseTo(10);
        expect(turned.y).toBeCloseTo(-20 + 0.6 + FOOT);
        expect(turned.facing).toBe(180);
        // A three-quarter turn: the field side is -x
        const threeQuarter = playingSpotOf("pit/marimba-5.0", {
            center: { x: 10, y: 20 },
            depth: 1,
            rotation: 270,
        })!;
        expect(threeQuarter.x).toBeCloseTo(10 - 0.5 - FOOT);
        expect(threeQuarter.y).toBeCloseTo(20);
        // -180 is the same turn as 180
        const negative = playingSpotOf("pit/marimba-5.0", {
            center: { x: 10, y: -20 },
            depth: 1.2,
            rotation: -180,
        })!;
        expect(negative.x).toBeCloseTo(turned.x);
        expect(negative.y).toBeCloseTo(turned.y);
    });

    it("works in any unit, given its units per meter", () => {
        const spot = playingSpotOf(
            "pit/marimba-5.0",
            { center: { x: 100, y: 200 }, depth: 1, rotation: 0 },
            10,
        )!;
        expect(spot.y).toBeCloseTo(200 - 10 * (0.5 + FOOT));
        expect(spot.reach).toBeCloseTo(10 * PLAYING_SPOT_TOLERANCE_M);
    });

    it("has none for equipment nobody plays", () => {
        expect(playingSpotOf("pit/speaker-tall", marimba)).toBeNull();
        expect(playingSpotOf(null, marimba)).toBeNull();
    });
});

describe("isOnPlayingSpot", () => {
    const spot = playingSpotOf("pit/marimba-5.0", {
        center: { x: 0, y: 0 },
        depth: 1,
        rotation: 0,
    })!;

    it("takes a dot within about a foot of the spot", () => {
        expect(PLAYING_SPOT_TOLERANCE_M).toBeCloseTo(FOOT);
        expect(isOnPlayingSpot({ x: spot.x, y: spot.y }, spot)).toBe(true);
        expect(
            isOnPlayingSpot({ x: spot.x + 0.9 * FOOT, y: spot.y }, spot),
        ).toBe(true);
        expect(
            isOnPlayingSpot(
                { x: spot.x + 0.6 * FOOT, y: spot.y + 0.6 * FOOT },
                spot,
            ),
        ).toBe(true);
    });

    it("refuses a dot farther away", () => {
        expect(
            isOnPlayingSpot({ x: spot.x + 1.1 * FOOT, y: spot.y }, spot),
        ).toBe(false);
        expect(isOnPlayingSpot({ x: 0, y: 0 }, spot)).toBe(false);
    });
});
