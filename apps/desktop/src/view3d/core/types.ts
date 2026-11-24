/**
 * Shared contracts for 3D View (ADR 0010). Everything under `view3d/core/` is
 * framework-free: no React, React Three Fiber, drei, Electron or database
 * imports. See docs/3d/design.md.
 *
 * World units are meters. The origin is center front (the center of the
 * front sideline), +X points toward side 2, +Y points up and +Z points toward
 * the audience, so the field occupies z <= 0.
 */
import type { FieldFootprint } from "@openmarch/core";
import type { Object3D, Vector3Tuple } from "three";
import type { FieldSurfaceStyle } from "./field/plan";

/** Venue kits shipped in the MVP. `blank` is the field on a plain ground. */
export type VenueKitId =
    | "hs"
    | "bighs"
    | "college"
    | "pro"
    | "markDiesel"
    | "gym"
    | "arena"
    | "blank";

/** Lighting presets. Each kit lists the ones it supports. */
export type LightingPreset =
    | "day"
    | "dusk"
    | "night"
    | "roofClosed"
    | "house"
    | "show";

/** The show's credits for video boards. Blank fields are left off. */
export interface ShowCredits {
    /** The show's project name, or the file name when it has none. */
    title: string;
    designer?: string;
    client?: string;
    /**
     * The board's words in the app's language, from the window (the core
     * can't translate). English when absent, as in the gallery and tests.
     */
    text?: CreditsText;
}

/** Translated words on a credits board. */
export interface CreditsText {
    /** Above the title, e.g. "Now performing"; the board sets it in capitals. */
    heading: string;
    /** The title when the show has no name. */
    untitled: string;
    /** The whole designer line, e.g. "Designed by Sam Rivera". */
    designer?: string;
    /** The whole client line, e.g. "For Lincoln High School". */
    client?: string;
}

/** Small per-show settings stored with the venue (ADR 0010 D-5). */
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

/** `saved` is a view the show saved (`cameraList.ts`); kits never use it. */
export type CameraSeatKind = "seat" | "aerial" | "topDown" | "floor" | "saved";

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
    /**
     * Share of this row's people who stand, 0 to 1, in place of the crowd's
     * own `standing` (a deck people stand on rather than seats).
     * "people" only.
     */
    standing?: number;
}

/**
 * How a kit wants its crowd drawn (`KitResult.crowd`). The scene passes these
 * to `buildCrowd` with the seat rows. Positions are in the seat rows' own
 * (kit-root) space.
 */
export interface KitCrowdOptions {
    /**
     * "blocks": the shared block crowd, with a fill light of its own.
     * "people": torso-and-head figures lit only by the scene, so they go
     * dark with the venue; full figures around the camera and cards
     * further out, so a full house stays cheap. Default "blocks".
     */
    style?: "blocks" | "people";
    /** Distance between neighbors along a row, meters. Default 0.64. */
    spacing?: number;
    /**
     * How full the seat at a point is, 0 to 1; multiplies the density. Lets
     * a kit fill one stand and leave another nearly empty.
     */
    fill?(x: number, y: number, z: number): number;
    /**
     * The light that reaches the seat at a point, 0 to 1 (the kit's baked
     * spill); multiplies the person's colors. "people" only.
     */
    shade?(x: number, y: number, z: number): number;
    /** Fraction of people standing, 0 to 1. "people" only. Default 0. */
    standing?: number;
    /** Clothing colors (hex) for every row, instead of the team palette. */
    clothes?: number[];
    /**
     * The most the scene clears around a camera in a seat, meters. Figures
     * that hold up at arm's length can stay closer than the blocks do.
     */
    clearRadius?: number;
    /** People between aisles along a row, for rows already split at aisles. */
    aisleEvery?: number;
}

export interface KitBuildInput {
    footprint: FieldFootprint;
    params: VenueParams;
    /** "low" drops shadows and halves crowd density. */
    quality: "low" | "high";
    /**
     * Whether a kit with its own podium (`hs`, `bighs`) draws it. False when the show has a
     * podium item (docs/3d/instruments.md §6). Defaults to true.
     */
    venuePodium?: boolean;
    /**
     * The style the show's field is painted in (`kitFieldStyle`). A
     * fixed-field kit paints its own field under a floor that isn't turf.
     * Defaults to a floor.
     */
    fieldStyle?: FieldSurfaceStyle;
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
    /**
     * Suggested crowd density (0..1) for `buildCrowd`. Kits never build the
     * crowd themselves: the scene builds it from `seatRows`, so it can toggle
     * and recolor it without rebuilding the kit. Defaults to 0.6.
     */
    crowdDensity?: number;
    /** Kit-level crowd options (style, fill, shade); see `KitCrowdOptions`. */
    crowd?: KitCrowdOptions;
    /**
     * Whether the shared land and horizon (fields, woods, a town) surround
     * the venue at high quality. Defaults to true; the blank venue stays bare.
     */
    surroundings?: boolean;
    lightingPresets: LightingPreset[];
    defaultLighting: LightingPreset;
    /**
     * The key of this kit's own lighting values (`lightingValues(preset,
     * venue)`), for a kit whose hall is lit unlike the shared presets. The
     * scene passes it to the environment and its environment map. Absent for
     * kits that use the shared values.
     */
    lightingVenue?: string;
    /** Applies a preset; ignores ones not in `lightingPresets`. */
    setLighting(preset: LightingPreset): void;
    /**
     * Shows the show's credits on the kit's video boards, if it has any.
     * Called after the build and whenever the credits change; cheap to repeat.
     */
    setShowCredits?(credits: ShowCredits): void;
    /** Per-frame hook, e.g. hide the roof when the camera is above it. */
    onFrame?(ctx: FrameContext): void;
    dispose(): void;
}

export type KitBuilder = (input: KitBuildInput) => KitResult;
