import type { Object3D } from "three";
import type { SharedMaterials } from "../../environment";
import { ft } from "../../environment/units";
import type {
    FieldFootprint,
    FrameContext,
    LightingPreset,
    VenueParams,
} from "../../types";

/**
 * The shared frame of the Nightpound kit: every dimension the floor, bowl,
 * drape, roof and scoreboard agree on. Nightpound is a fictional arena
 * modeled on the University of Dayton Arena as WGI sets it up for its World
 * Championships. The floor numbers come from WGI's site packets; the bowl's
 * from seating charts and photos (docs/3d/nightpound.md).
 *
 * Kit-root space: the origin is the CENTER OF THE COMPETITION AREA at floor
 * level, +Y is up, the area's 106 ft length runs along X.
 *
 *   +Z  the front: the judges' side (section 113 at center)
 *   -Z  the back: the drape, with the curtain tunnel behind it
 *   +X  the entry end (the performers come in at the back corner here)
 *   -X  the exit end
 *
 * Unlike the stadiums, nothing here follows the show's field: the arena is
 * the same size for every show. The kit root sits on the field's center, so
 * the show's floor lies at the middle of the competition area.
 */

/** What every Nightpound part builder gets. */
export interface NightpoundCtx {
    footprint: FieldFootprint;
    params: VenueParams;
    quality: "low" | "high";
    shared: SharedMaterials;
}

/** What every Nightpound part builder returns; the kit composes them. */
export interface NightpoundPart {
    /** In kit-root space; the kit adds it to its root. */
    object: Object3D;
    setLighting(preset: LightingPreset): void;
    dispose(): void;
    pickTargets?: Object3D[];
    /** Per-frame hook; `cameraPosition` is in kit-root space. */
    onFrame?(ctx: FrameContext): void;
}

export type NightpoundPartBuilder = (ctx: NightpoundCtx) => NightpoundPart;

/**
 * The competition area: WGI's largest, 106 ft by 78 ft (the color guard
 * championships; percussion and winds use 106 by 72 in the same arena).
 */
export const AREA = { halfX: ft(106) / 2, halfZ: ft(78) / 2 };

/** WGI's safety zone between the competition area and any seating. */
export const SAFETY = ft(5);

/**
 * The black tarp covers the competition area and its safety zone, laid in
 * strips front to back about 9.5 ft wide (WGI color guard packet).
 */
export const TARP = {
    halfX: AREA.halfX + SAFETY,
    halfZ: AREA.halfZ + SAFETY,
    strip: ft(9.5),
};

/** The back drape: 11 ft of black cloth along the back of the floor. */
export const DRAPE_HEIGHT = ft(11);

/** The curtain tunnel behind the drape (2025 packet): 11 ft 5 in by 10 ft 4 in. */
export const CURTAIN_TUNNEL = {
    width: ft(11 + 5 / 12),
    height: ft(10 + 4 / 12),
};

/** The openings onto the floor at the back corners (2025 packet). */
export const ENTRY = { width: ft(10 + 11 / 12), height: ft(11) };
export const EXIT = { width: ft(10 + 8 / 12), height: ft(11 + 1 / 12) };

/** Bottom of the center-hung video board above the floor (all packets). */
export const SCOREBOARD_BOTTOM = ft(32);

/** Seated eye height above the tread. */
export const EYE = 1.2;
/** Crowd seat height above the tread. */
export const SEAT_HEIGHT = 0.42;
/** Seat spacing along a row; matches the crowd's person spacing. */
export const SEAT_PITCH = 0.52;
