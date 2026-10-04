/**
 * Shared contracts for 3D View (ADR 0002). Everything under `view3d/core/` is
 * framework-free: no React, React Three Fiber, drei, Electron or database
 * imports. See docs/3d/design.md.
 *
 * World units are meters. The origin is center front (the center of the
 * front sideline), +X points toward side 2, +Y points up and +Z points toward
 * the audience, so the field occupies z <= 0.
 */
import type { FieldFootprint } from "@openmarch/core";
import type { Object3D, Vector3Tuple } from "three";

/** Venue kits shipped in the MVP. `blank` is the field on a plain ground. */
export type VenueKitId = "hs" | "bighs" | "college" | "pro" | "gym" | "blank";

/** Lighting presets. Each kit lists the ones it supports. */
export type LightingPreset =
    | "day"
    | "dusk"
    | "night"
    | "roofClosed"
    | "house"
    | "show";

/** Small per-show settings stored with the venue (ADR 0002 D-5). */
export interface VenueParams {
    /** "#rrggbb" */
    homeColor: string;
    /** "#rrggbb" */
    awayColor: string;
    /** Painted in both end zones of football fields; may be empty. */
    endZoneText: string;
    /** "#rrggbb" */
    endZoneColor: string;
}

/** The performance surface in world meters (from `fieldFootprint`). */
export type { FieldFootprint } from "@openmarch/core";

export type CameraSeatKind = "seat" | "aerial" | "topDown" | "floor";

/** A named place a person actually sits or stands. */
export interface CameraSeat {
    /** Stable id, such as "pressBox" or "frontRow". */
    id: string;
    /** Tolgee key for the label shown in the camera bar. */
    labelKey: string;
    kind: CameraSeatKind;
    /** Eye position in world meters. */
    position: Vector3Tuple;
    /** Look-at point in world meters. */
    target: Vector3Tuple;
    /** Vertical field of view; defaults to the window's. */
    fovDeg?: number;
}

/**
 * One row of seats, as a polyline at seat height. The crowd builder places
 * people along it, and pick-a-seat snaps to it.
 */
export interface SeatRow {
    points: Vector3Tuple[];
    closed: boolean;
    /** Tread depth in meters. */
    depth: number;
    /** Home side, away side or neutral; picks crowd colors. */
    side: "home" | "away" | "neutral";
}

export interface KitBuildInput {
    footprint: FieldFootprint;
    params: VenueParams;
    /** "low" drops shadows and halves crowd density. */
    quality: "low" | "high";
}

export interface FrameContext {
    cameraPosition: Vector3Tuple;
    /** Seconds since the last frame. */
    dt: number;
}

/** What every venue kit builder returns. The caller owns disposal. */
export interface KitResult {
    root: Object3D;
    /** Default look-at point, normally the field center. */
    focus: Vector3Tuple;
    cameras: CameraSeat[];
    seatRows: SeatRow[];
    /** Meshes that pick-a-seat raycasts against. */
    pickTargets: Object3D[];
    lightingPresets: LightingPreset[];
    defaultLighting: LightingPreset;
    /** Applies a preset; ignores ones not in `lightingPresets`. */
    setLighting(preset: LightingPreset): void;
    /** Per-frame hook, e.g. hide the roof when the camera is above it. */
    onFrame?(ctx: FrameContext): void;
    dispose(): void;
}

export type KitBuilder = (input: KitBuildInput) => KitResult;
