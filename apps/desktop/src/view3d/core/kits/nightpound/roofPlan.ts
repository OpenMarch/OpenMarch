import type { Vector3Tuple } from "three";
import { AREA, SAFETY } from "./frame";
import { ARENA_CENTER_Z } from "./plan";

/**
 * Nightpound's roof in numbers, kit-root space (`frame.ts`). Only the
 * center-hung board is a published measurement; the rest is read off photos
 * and an aerial (docs/3d/nightpound.md, section 3): black steel trusses
 * across the short way of the hall, joists and a ribbed deck above them, and
 * a grid of white can lights under the bottom chords.
 */
export const ROOF = {
    /** The trusses' flat bottom chord above the floor (80 ft). */
    chordY: 24.5,
    /** The deck's underside at the ridge, which runs along Z over X = 0. */
    ridgeY: 29.5,
    /** The deck's underside at the two end walls. */
    eaveY: 27,
    /** The main roof's walls: the two ends, the back and the front. */
    halfX: 28.8,
    minZ: -57.9,
    maxZ: 63.3,
    /** Thirteen trusses span X, 32 ft apart, one over the arena's center. */
    trussPitch: 9.75,
    trussEachSide: 6,
    /** Truss panel points along X. */
    trussBays: 20,
    /** Open-web joists run along Z on top of the trusses. */
    joistPitch: 2.4,
    joistDepth: 0.6,
} as const;

/** The deck's underside over `x`: a low pitch from the ridge to the ends. */
export function roofDeckY(x: number): number {
    const t = Math.min(1, Math.abs(x) / ROOF.halfX);
    return ROOF.ridgeY + (ROOF.eaveY - ROOF.ridgeY) * t;
}

/** Where the trusses stand along Z. */
export function trussStations(): number[] {
    const out: number[] = [];
    for (let n = -ROOF.trussEachSide; n <= ROOF.trussEachSide; n++)
        out.push(ARENA_CENTER_Z + n * ROOF.trussPitch);
    return out;
}

/**
 * Where this part's black walls stop and the bowl's own rear walls take
 * over. The side stands' top row is at 22.2 m, so the walls behind them come
 * down to there; the ends have no upper deck, and their wall comes down to
 * the ceiling over the end decks.
 */
export const ROOF_WALL_FOOT = { sides: 18.2, ends: 17.5 } as const;

/** The can lights: 0.5 m across, their faces 1 m under the bottom chord. */
export const CAN = {
    radius: 0.25,
    height: 0.45,
    faceY: ROOF.chordY - 1,
    /** About 6 m apart over the floor, 9 m over the stands. */
    floorPitch: 6,
    standPitch: 9,
} as const;

export interface CanLight {
    position: Vector3Tuple;
    /** Over the floor rather than the stands. */
    floor: boolean;
}

/**
 * Where the can lights hang, by the center of each face. Over the floor
 * they hang under every truss and from the joists half way between, 6 m
 * apart along the truss; over the stands under each truss only, 9 m apart.
 * Pure.
 */
export function canLayout(): CanLight[] {
    const out: CanLight[] = [];
    const floorX = AREA.halfX + SAFETY + 2;
    const floorMinZ = -(AREA.halfZ + SAFETY) - 3;
    const floorMaxZ = AREA.halfZ + SAFETY + 9;
    const overFloor = (z: number) => z > floorMinZ && z < floorMaxZ;
    const stations = trussStations();
    const row = (z: number, pitch: number, from: number, to: number) => {
        const n = Math.floor(to / pitch);
        for (let i = -n; i <= n; i++) {
            const x = i * pitch;
            if (Math.abs(x) < from) continue;
            out.push({
                position: [x, CAN.faceY, z],
                floor: overFloor(z) && Math.abs(x) <= floorX,
            });
        }
    };
    stations.forEach((z, k) => {
        if (overFloor(z)) {
            row(z, CAN.floorPitch, 0, floorX);
            // The stands at the two ends, beyond the floor's rows.
            for (const x of [ROOF.halfX - 6, ROOF.halfX - 2])
                for (const sx of [-1, 1])
                    out.push({
                        position: [sx * x, CAN.faceY, z],
                        floor: false,
                    });
        } else row(z, CAN.standPitch, 0, ROOF.halfX - 2);
        const next = stations[k + 1];
        if (next !== undefined && overFloor(z) && overFloor(next))
            row((z + next) / 2, CAN.floorPitch, 0, floorX);
    });
    return out;
}

/** A line array: where its top hangs and which way it plays (radians, 0 = +Z). */
export interface SpeakerCluster {
    position: Vector3Tuple;
    yaw: number;
}

/** A line array is about 1.2 wide, 2.5 tall and 1 deep; its top hangs here. */
export const SPEAKER = { width: 1.2, height: 2.5, depth: 1, topY: 20.5 };

/**
 * Six arrays around the board on a 12 m circle, each playing outward, and
 * two over each end stand. None sits between the back flags and the front
 * stand's middle. Pure.
 */
export function speakerLayout(): SpeakerCluster[] {
    const out: SpeakerCluster[] = [];
    for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        out.push({
            position: [
                Math.cos(a) * 12,
                SPEAKER.topY,
                ARENA_CENTER_Z + Math.sin(a) * 12,
            ],
            yaw: Math.atan2(Math.cos(a), Math.sin(a)),
        });
    }
    for (const sx of [-1, 1])
        for (const sz of [-1, 1])
            out.push({
                position: [sx * 24, SPEAKER.topY, ARENA_CENTER_Z + sz * 8],
                yaw: (sx * Math.PI) / 2,
            });
    return out;
}

/**
 * The flags of nations: two rows of eight on the back side, hung long side
 * down and edge to edge, each about 1.8 m by 3 m. Scaled off the 2025
 * packet photo, each row is 14.4 m long and starts 9 m off the centerline,
 * so both rows show past the board from the front stand.
 */
export const FLAGS = {
    count: 16,
    width: 1.8,
    height: 3,
    gap: 0,
    z: -33,
    topY: 19.5,
    /** Each row starts this far off the centerline. */
    inner: 9,
} as const;

/** The left edge of flag `i` (0 to 15, from -X to +X). */
export function flagLeft(i: number): number {
    const row = FLAGS.count / 2;
    const step = FLAGS.width + FLAGS.gap;
    return i < row
        ? -FLAGS.inner - (row - i) * step + FLAGS.gap
        : FLAGS.inner + (i - row) * step;
}

/** Nothing but the board hangs lower than this over the competition area. */
export const OVERHEAD_CLEARANCE = 9.75;

/**
 * Whether a camera at height `y` (kit-root space) is under the roof. Above
 * the bottom chords the roof and the board hide, so top-down and aerial
 * views see the floor.
 */
export function underNightpoundRoof(y: number): boolean {
    return y < ROOF.chordY;
}
