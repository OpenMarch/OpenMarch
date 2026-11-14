/**
 * The show's performer defaults (ADR 0004 D-4, amended 2026-11-11): how
 * marchers move in the 3D View wherever no cue says otherwise. They are
 * saved in the workspace settings (`performerDefaults`) and set in Show
 * settings; a field left unset takes the built-in default
 * (`BUILT_IN_PERFORMER_DEFAULTS`). Cues will change them from a count once
 * cue storage is back.
 *
 * Pure: no React, three.js or database.
 */
import * as z from "zod";

/** The foot every move steps off on. */
export type StepOffFoot = "left" | "right";
export const STEP_OFF_FEET: readonly StepOffFoot[] = ["left", "right"];

/**
 * What a marcher's dot marks at the end of each count (docs/3d/technique.md,
 * "Foot on the dot"): the landing foot's ankle, or the body's center.
 */
export type DotMode = "foot" | "body";
export const DOT_MODES: readonly DotMode[] = ["foot", "body"];

/**
 * How the leg in motion gets to a new direction (docs/3d/technique.md,
 * "Direction changes"): round the corner, along its own line and then out
 * (`corner`), or straight across it (`direct`).
 */
export type DirectionChange = "corner" | "direct";
export const DIRECTION_CHANGES: readonly DirectionChange[] = [
    "corner",
    "direct",
];

/** What a holding marcher does on a count where others travel. */
export type HoldWhileBandMoves = "stand" | "markTime" | "highMarkTime";
export const HOLDS_WHILE_BAND_MOVES: readonly HoldWhileBandMoves[] = [
    "markTime",
    "highMarkTime",
    "stand",
];

/**
 * How percussion travels off straight forward and back
 * (docs/3d/technique.md, "The crab step"): crab, hips square, or slide like
 * the winds.
 */
export type PercussionTravel = "crab" | "slide";
export const PERCUSSION_TRAVELS: readonly PercussionTravel[] = [
    "crab",
    "slide",
];

export interface PerformerDefaults {
    stepOffFoot: StepOffFoot;
    dotMode: DotMode;
    directionChange: DirectionChange;
    holdWhileBandMoves: HoldWhileBandMoves;
    percussionTravel: PercussionTravel;
}

/** Left foot, foot on the dot, round the corner, mark time, drums crab. */
export const BUILT_IN_PERFORMER_DEFAULTS: PerformerDefaults = {
    stepOffFoot: "left",
    dotMode: "foot",
    directionChange: "corner",
    holdWhileBandMoves: "markTime",
    percussionTravel: "crab",
};

/**
 * As saved in the workspace settings: every field optional. A value it
 * doesn't know reads as unset, so one bad field can't throw away the rest
 * of the workspace settings.
 */
export const performerDefaultsSchema = z.object({
    stepOffFoot: z.enum(["left", "right"]).optional().catch(undefined),
    dotMode: z.enum(["foot", "body"]).optional().catch(undefined),
    directionChange: z.enum(["corner", "direct"]).optional().catch(undefined),
    holdWhileBandMoves: z
        .enum(["stand", "markTime", "highMarkTime"])
        .optional()
        .catch(undefined),
    percussionTravel: z.enum(["crab", "slide"]).optional().catch(undefined),
});
export type SavedPerformerDefaults = z.infer<typeof performerDefaultsSchema>;

/** The saved defaults with the built-in ones filled in. */
export function performerDefaults(
    saved: SavedPerformerDefaults | undefined,
): PerformerDefaults {
    return { ...BUILT_IN_PERFORMER_DEFAULTS, ...dropUnset(saved ?? {}) };
}

const dropUnset = <T extends object>(o: T): Partial<T> =>
    Object.fromEntries(
        Object.entries(o).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
