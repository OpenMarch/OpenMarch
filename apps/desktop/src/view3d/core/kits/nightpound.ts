import { Group, type Vector3Tuple } from "three";
import { createSharedMaterials } from "../environment";
import type {
    CameraSeat,
    KitBuilder,
    LightingPreset,
    ShowCredits,
} from "../types";
import { bowlEye, buildBowl } from "./nightpound/bowl";
import { buildDrape } from "./nightpound/drape";
import { buildFloor } from "./nightpound/floor";
import { buildLighting } from "./nightpound/lighting";
import { buildRoof } from "./nightpound/roof";
import { buildScoreboard } from "./nightpound/scoreboard";
import {
    SEAT_PITCH,
    type NightpoundCtx,
    type NightpoundPart,
} from "./nightpound/frame";
import { ARENA_CENTER_Z, DRAPE_RUN, DRAPE_Z, FLOOR } from "./nightpound/plan";

/**
 * The Nightpound kit: Nightpound, OH, a fictional arena modeled on the
 * University of Dayton Arena as WGI dresses it for its World Championships.
 * Unlike the other venues it doesn't grow to fit the field: the floor is
 * WGI's 106 by 78 ft competition area, and only a field that fits it can be
 * shown here (`KIT_FIXED_FLOOR`). The show's floor lies at its center.
 *
 * `nightpound/frame.ts` holds the shared dimensions and `nightpound/plan.ts`
 * the floor plan; the parts each build one object around the competition
 * area's center, and this module places them on the field's center.
 */

/**
 * What a championship crowd wears in April: hoodies and jackets in grays
 * and navy, and plenty of the groups' own shirts in every color.
 */
const CLOTHES = [
    0x17181c, 0x23262d, 0x2b2f3a, 0x1c2540, 0x2f4372, 0x4b5568, 0x6f7480,
    0x8d9096, 0xc8c6be, 0xe8e6df, 0x7d2a2c, 0xb3262e, 0x1f4a86, 0x2e7bc4,
    0x2e5137, 0x3f8f4f, 0x46305c, 0x7b4fb0, 0xd9762b, 0xe3b53a, 0x2a5d61,
    0xc94f8a,
];

export const NIGHTPOUND_PRESETS: LightingPreset[] = ["show", "house"];

/** A part that can show the show's credits (the center-hung board). */
type CreditsPart = NightpoundPart & { setCredits(credits: ShowCredits): void };
const showsCredits = (part: NightpoundPart): part is CreditsPart =>
    typeof (part as Partial<CreditsPart>).setCredits === "function";

export const buildNightpound: KitBuilder = ({ footprint, params, quality }) => {
    const shared = createSharedMaterials();
    const ctx: NightpoundCtx = { footprint, params, quality, shared };
    const cx = (footprint.minX + footprint.maxX) / 2;
    const cz = (footprint.minZ + footprint.maxZ) / 2;

    const root = new Group();
    root.name = "kit.nightpound";
    const placed = new Group();
    placed.name = "nightpound.frame";
    placed.position.set(cx, 0, cz);
    root.add(placed);

    const bowl = buildBowl(ctx);
    const parts: NightpoundPart[] = [
        buildFloor(ctx),
        bowl,
        buildDrape(ctx),
        buildRoof(ctx),
        buildScoreboard(ctx),
        buildLighting(ctx),
    ];
    parts.forEach((part) => placed.add(part.object));

    const toWorld = ([x, y, z]: Vector3Tuple): Vector3Tuple => [
        x + cx,
        y,
        z + cz,
    ];
    const setLighting = (preset: LightingPreset) => {
        if (!NIGHTPOUND_PRESETS.includes(preset)) return;
        parts.forEach((part) => part.setLighting(preset));
    };
    const defaultLighting: LightingPreset = "show";
    setLighting(defaultLighting);

    return {
        root,
        focus: toWorld([0, 0, 0]),
        cameras: nightpoundCameras().map((seat) => ({
            ...seat,
            position: toWorld(seat.position),
            target: toWorld(seat.target),
        })),
        seatRows: bowl.seatRows.map((row) => ({
            ...row,
            points: row.points.map(toWorld),
        })),
        pickTargets: parts.flatMap((part) => part.pickTargets ?? []),
        // The fill says how full each seat is; nothing scales it but quality.
        crowdDensity: 1,
        crowd: {
            style: "people",
            spacing: SEAT_PITCH,
            aisleEvery: 1e6,
            standing: 0.02,
            clearRadius: 3.4,
            // From a seat, nobody hides the show's floor or its lines.
            keepInView: {
                minX: footprint.minX - 0.3,
                maxX: footprint.maxX + 0.3,
                minZ: footprint.minZ - 0.3,
                maxZ: footprint.maxZ + 0.3,
            },
            clothes: CLOTHES,
            // The seat rows are in the scene's space; the bowl thinks in the
            // kit's, round the competition area's center.
            fill: (x, y, z) => bowl.fill(x - cx, y, z - cz),
        },
        surroundings: false,
        lightingPresets: [...NIGHTPOUND_PRESETS],
        defaultLighting,
        lightingVenue: "nightpound",
        setLighting,
        setShowCredits(credits) {
            parts.filter(showsCredits).forEach((p) => p.setCredits(credits));
        },
        onFrame({ cameraPosition: [x, y, z], dt }) {
            const local = {
                cameraPosition: [x - cx, y, z - cz] as Vector3Tuple,
                dt,
            };
            parts.forEach((part) => part.onFrame?.(local));
        },
        dispose() {
            parts.forEach((part) => part.dispose());
            shared.dispose();
            root.clear();
        },
    };
};

/**
 * Named cameras, in kit-root space (positions from the cross-section in
 * docs/3d/nightpound.md; seats from WGI's packets).
 *
 * - `judges`: high on the front side on the center aisle, row N of the
 *   200s, where WGI's judges usually sit (the packets don't say).
 * - `directors`: the staff viewing area, section 219's club row B.
 * - `soundBoard`: the sound engineer, section 219 row A.
 * - `frontRow`: the low staff viewing area, section 113 rows B and C.
 * - `floor`: standing on the floor's front line.
 * - `tunnel`: in the performance entry, at the back corner.
 * - `upperDeck`: section 411, row J.
 */
export function nightpoundCameras(): CameraSeat[] {
    const cam = (
        id: string,
        kind: CameraSeat["kind"],
        position: Vector3Tuple,
        target: Vector3Tuple,
        label = id,
    ): CameraSeat => ({
        id,
        labelKey: `view3d.camera.${label}`,
        kind,
        position,
        target,
    });
    /** A seat on the front side, `x` meters along it from center. */
    const front = (
        tier: Parameters<typeof bowlEye>[1],
        row: number,
        x = 0,
    ): Vector3Tuple => {
        const [, y, z] = bowlEye("front", tier, row);
        return [x, y, z];
    };
    return [
        // Row N of the 200s on the center aisle.
        cam("judges", "seat", front("200", 13), [0, 0.5, -2]),
        cam("directors", "seat", front("club", 1, -3), [0, 0.5, 0]),
        cam("soundBoard", "seat", front("200", 0, -1.2), [0, 0.5, -1]),
        cam("frontRow", "seat", front("100", 2, -5), [0, 0.5, -1]),
        cam("floor", "floor", [0, 1.6, FLOOR.maxZ - 1.8], [0, 1.5, DRAPE_Z]),
        cam(
            "tunnel",
            "floor",
            // Just through the entry, clear of its truss legs.
            [(DRAPE_RUN.maxX + FLOOR.maxX) / 2 + 0.4, 1.6, DRAPE_Z + 0.7],
            [0, 1.2, 2],
        ),
        // Section 411, row J: the 300s are rows 0 to 15 of the rake.
        cam("upperDeck", "seat", front("300", 16 + 9), [0, 0, 0]),
        cam("blimp", "aerial", [-70, 85, 90], [0, 0, ARENA_CENTER_Z]),
        // A tiny +Z offset keeps the front at the bottom of the screen.
        cam("topDown", "topDown", [0, 140, 0.15], [0, 0, 0]),
    ];
}
