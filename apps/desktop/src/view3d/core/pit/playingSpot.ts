/**
 * Where a pit player stands to play an instrument (instruments.md section 6, "Players are
 * marchers"): nothing stores who plays what, so whoever's dot is on an instrument's playing spot
 * plays it. Players stand on the field side of the instrument, facing the audience.
 *
 * Pure: no React, no database, no three.js. The 2D field draws the spot as a faint marker; the 3D
 * View reads the same spot to snap a player into a playing pose.
 *
 * Coordinates are the field plan's: x across the field, +y toward the audience (the 2D canvas,
 * or the 3D world's z), in any unit given its units per meter. A model's -Z (the field side, the
 * pit `README.md`'s axes) is plan -y before the item turns; it turns as the field turns Outlines
 * (`placeOutline`, `writePropMatrix`).
 */
import { pitFamily } from "./catalog";

/** How far past the footprint's field-side edge the player stands: about a foot */
export const PLAYING_SPOT_STANDOFF_M = 0.3048;

/** How near a dot must be to a playing spot to be on it: about a foot */
export const PLAYING_SPOT_TOLERANCE_M = 0.3048;

/**
 * Whether a built-in model is a pit instrument someone plays, with a playing spot: an offered
 * variant of a family the catalog marks as played. Speakers, the mixer, podiums, amps, the
 * standing podiums and towers, and any model the catalog doesn't offer are not.
 */
export function isPlayedPitModel(model: string | null | undefined): boolean {
    return pitFamily(model)?.played ?? false;
}

/** An item's footprint on the field plan */
export interface PitFootprint {
    /** Where the timeline has the item, in plan units */
    readonly center: { readonly x: number; readonly y: number };
    /** Front to back, in meters (the Outline's `depth`) */
    readonly depth: number;
    /** Degrees, as the field turns the item's Outline */
    readonly rotation: number;
}

/** Where a player stands to play an instrument */
export interface PlayingSpot {
    /** In plan units */
    readonly x: number;
    readonly y: number;
    /**
     * The way the player faces, in degrees as the item turns: 0 toward the audience, the way the
     * instrument faces
     */
    readonly facing: number;
    /** How near a dot must be to be on the spot, in plan units */
    readonly reach: number;
}

/**
 * The playing spot of an item with model `model`, or null when nobody plays it (no model,
 * speakers, the mixer, podiums): centered on the field side of its footprint,
 * {@link PLAYING_SPOT_STANDOFF_M} past its edge, turned with it.
 *
 * @param unitsPerMeter the plan's units per meter: 1 for meters, `PIXELS_PER_METER` for the 2D
 *   canvas
 */
export function playingSpotOf(
    model: string | null | undefined,
    footprint: PitFootprint,
    unitsPerMeter = 1,
): PlayingSpot | null {
    if (!isPlayedPitModel(model)) return null;
    const { center, depth, rotation } = footprint;
    const back = (depth / 2 + PLAYING_SPOT_STANDOFF_M) * unitsPerMeter;
    const radians = (rotation * Math.PI) / 180;
    // The local point (0, -back), turned as `placeOutline` turns a point
    return {
        x: center.x + back * Math.sin(radians),
        y: center.y - back * Math.cos(radians),
        facing: rotation,
        reach: PLAYING_SPOT_TOLERANCE_M * unitsPerMeter,
    };
}

/** Whether a dot at `dot` (plan units) is on `spot`: within its reach */
export function isOnPlayingSpot(
    dot: { readonly x: number; readonly y: number },
    spot: PlayingSpot,
): boolean {
    return Math.hypot(dot.x - spot.x, dot.y - spot.y) <= spot.reach;
}
