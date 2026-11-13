import type { FieldFootprint, WorldPoint } from "../field/world";
import type { BuiltinRigId } from "./rigs";

/**
 * Broadcast-style camera shots for the 3D View.
 *
 * A shot is four independent choices: what to look at (subject), where the
 * camera lives (rig), what it does during the shot (move) and how it arrives
 * (transition). Everything here is in world meters (see `../field/world`):
 * +X toward side 2, +Y up, +Z toward the audience.
 */

/** `[x, y, z]` in world meters. */
export type Vec3 = [number, number, number];

/** Where the camera is, what it looks at, and its vertical field of view. */
export interface CameraPose {
    position: Vec3;
    target: Vec3;
    fovDeg: number;
}

/** How much of the frame the subject fills. */
export type Tightness = "wide" | "medium" | "tight" | "closeUp";

export type CinemaSubject =
    | { kind: "band" }
    /** The band's centroid, framed at the shot's tightness. */
    | { kind: "center" }
    | { kind: "section"; section: string }
    | { kind: "tag"; tagId: number }
    | { kind: "set"; marcherIds: number[] }
    | { kind: "marcher"; marcherId: number }
    /** A rectangle on the ground, world meters. */
    | { kind: "region"; minX: number; maxX: number; minZ: number; maxZ: number }
    /** A fixed point on the ground, world meters. */
    | { kind: "spot"; x: number; z: number };

export type MoveId =
    | "hold"
    | "pushIn"
    | "pullOut"
    | "boomUp"
    | "boomDown"
    | "track"
    | "orbit"
    | "craneOver"
    | "drift";

export type TransitionId = "cut" | "smooth" | "whip" | "craneThrough";

/** A built-in rig, or a fixed pose (venue kit cameras and saved views). */
export type RigRef =
    | { kind: "builtin"; id: BuiltinRigId }
    | { kind: "pose"; pose: CameraPose };

export interface CinemaShot {
    id: string;
    /** Show time the shot starts at. */
    startMs: number;
    rig: RigRef;
    rigSettings?: {
        side?: 1 | 2;
        yardLine?: number;
        heightM?: number;
        backM?: number;
    };
    subject: CinemaSubject;
    tightness: Tightness;
    move: MoveId;
    moveSettings?: Record<string, number>;
    transition: TransitionId;
    /** Length of the transition into this shot. Undefined = the transition's default. */
    transitionMs?: number;
}

/** A circle on the ground that contains the subject, world meters. */
export interface SubjectBounds {
    cx: number;
    cz: number;
    radius: number;
}

export interface CinemaContext {
    footprint: FieldFootprint;
    stepMeters: number;
    /** Frame width / height. */
    aspect: number;
    /** Points of the subject at show time ms, world m. Empty when nobody matches. */
    subjectPoints(subject: CinemaSubject, ms: number): readonly WorldPoint[];
}
