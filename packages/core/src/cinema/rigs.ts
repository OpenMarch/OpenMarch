import type { CinemaContext, CinemaShot, Vec3 } from "./types";

/**
 * The built-in camera rigs, written in field terms (yard line, sideline,
 * meters back and up) so they resolve on any field.
 */

export type BuiltinRigId =
    | "pressBox"
    | "yard25"
    | "topDown"
    | "endZone"
    | "lowSideline"
    | "frontRow"
    | "aerial"
    | "closeUp"
    | "follow";

export type RigDef =
    /** A tripod off a sideline. `mirrorBySide` rigs have a side 1 and a side 2 variant. */
    | {
          id: BuiltinRigId;
          kind: "fixed";
          /** 0 to 100, 50 = center, below 50 = side 1. */
          yardLine: number;
          sideline: "front" | "back";
          /** Meters outside the sideline. */
          backM: number;
          heightM: number;
          mirrorBySide: boolean;
      }
    /** Behind the side 1 or side 2 goal line, on the field's center depth. */
    | { id: BuiltinRigId; kind: "endZone"; heightM: number; backM: number }
    /** Straight down over the subject. */
    | { id: BuiltinRigId; kind: "overhead"; heightM: number }
    /**
     * Placed from the subject. Azimuth 0 looks from the audience (camera at +Z
     * of the subject), positive turns toward side 2.
     */
    | {
          id: BuiltinRigId;
          kind: "free";
          azimuthDeg: number;
          elevationDeg: number;
      };

/** The camera never goes below this height, in meters. */
export const MIN_EYE_HEIGHT = 0.5;

export const BUILTIN_RIGS: Record<BuiltinRigId, RigDef> = {
    pressBox: {
        id: "pressBox",
        kind: "fixed",
        yardLine: 50,
        sideline: "front",
        backM: 45,
        heightM: 28,
        mirrorBySide: false,
    },
    yard25: {
        id: "yard25",
        kind: "fixed",
        yardLine: 25,
        sideline: "front",
        // Behind and above a high school home stand, beside its press box.
        backM: 40,
        heightM: 20,
        mirrorBySide: true,
    },
    topDown: { id: "topDown", kind: "overhead", heightM: 70 },
    endZone: { id: "endZone", kind: "endZone", heightM: 14, backM: 25 },
    lowSideline: {
        id: "lowSideline",
        kind: "fixed",
        yardLine: 50,
        sideline: "front",
        backM: 6,
        heightM: 1.6,
        mirrorBySide: false,
    },
    frontRow: {
        id: "frontRow",
        kind: "fixed",
        yardLine: 50,
        sideline: "front",
        backM: 14,
        heightM: 5,
        mirrorBySide: false,
    },
    aerial: { id: "aerial", kind: "free", azimuthDeg: 0, elevationDeg: 55 },
    // A little off the front, so a podium on the 50 is not in the way.
    closeUp: { id: "closeUp", kind: "free", azimuthDeg: 15, elevationDeg: 12 },
    // Steep enough to clear a press box roof when it follows the whole band.
    follow: { id: "follow", kind: "free", azimuthDeg: 0, elevationDeg: 35 },
};

/** World x of a yard line (0 to 100, 50 = center): 8 steps per 5 yards. */
export function yardLineX(yardLine: number, stepMeters: number): number {
    return ((yardLine - 50) / 5) * 8 * stepMeters;
}

/** A finite override, or the rig's own number. */
const pick = (override: number | undefined, fallback: number) =>
    override !== undefined && Number.isFinite(override) ? override : fallback;

/**
 * Eye position for a fixed or end zone rig, honoring the shot's rig settings:
 * side 2 mirrors x, and `yardLine`, `heightM` and `backM` override the rig's
 * numbers. Overhead and free rigs return null (they depend on the subject).
 */
export function rigEye(
    rig: RigDef,
    settings: CinemaShot["rigSettings"],
    ctx: Pick<CinemaContext, "footprint" | "stepMeters">,
): Vec3 | null {
    if (rig.kind !== "fixed" && rig.kind !== "endZone") return null;
    const { footprint } = ctx;
    const y = Math.max(MIN_EYE_HEIGHT, pick(settings?.heightM, rig.heightM));
    const backM = pick(settings?.backM, rig.backM);
    if (rig.kind === "endZone") {
        const x =
            settings?.side === 2
                ? footprint.maxX + backM
                : footprint.minX - backM;
        return [x, y, (footprint.minZ + footprint.maxZ) / 2];
    }
    const side1X = yardLineX(
        pick(settings?.yardLine, rig.yardLine),
        ctx.stepMeters,
    );
    // `+ 0` keeps the 50 at 0 rather than -0 when mirrored.
    const x = settings?.side === 2 ? -side1X + 0 : side1X;
    const z =
        rig.sideline === "front"
            ? footprint.maxZ + backM
            : footprint.minZ - backM;
    return [x, y, z];
}
