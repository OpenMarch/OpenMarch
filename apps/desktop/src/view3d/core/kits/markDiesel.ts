// cspell:ignore superframe superframes
import { Group, type Vector3Tuple } from "three";
import { createSharedMaterials } from "../environment";
import type {
    CameraSeat,
    KitBuilder,
    LightingPreset,
    SeatRow,
    ShowCredits,
} from "../types";
import { RING_PARTS } from "./bowl";
import { buildDieselBoards } from "./markDiesel/boards";
import {
    buildDieselBowl,
    DIESEL_SEAT_PITCH,
    DIESEL_SECTIONS,
    dieselCrowdFill,
    dieselCrowdShade,
} from "./markDiesel/bowl";
import { buildDieselDrape } from "./markDiesel/drape";
import { buildDieselFacade } from "./markDiesel/facade";
import {
    dieselFrame,
    type DieselCtx,
    type DieselFrame,
    type DieselPart,
} from "./markDiesel/frame";
import { buildDieselLighting, DIESEL_VENUE } from "./markDiesel/lighting";
import { buildDieselRoof } from "./markDiesel/roof";
import { buildDieselSite } from "./markDiesel/site";
import { buildDieselOwnField, buildDieselTurf } from "./markDiesel/turf";
import { fixedFieldFootprint } from "./fixedField";

/**
 * The Mark Diesel kit: Mark Diesel Stadium, a fictional retractable-roof
 * stadium dressed for a marching band championship. The roof is closed, the
 * field is lit from the catwalks under the two superframes, and a black
 * drape masks the back-sideline stand, so the audience on the front
 * sideline looks at the band against black.
 *
 * `markDiesel/frame.ts` holds every shared dimension and the frame the parts
 * are built in: kit-root space with the origin at the field center. The
 * parts (site, facade, bowl, roof, drape, boards, lighting) each build one
 * object in that space; this module places them on the field, and reports
 * seats and cameras in the scene's own space.
 *
 * The crowd is a finals-night full house: people-shaped, seated in every
 * drawn seat the drape leaves open, lit by the hall alone
 * (`KitResult.crowd`). The scene draws them as cards, with full figures for
 * the people around the camera.
 *
 * Every mark in the building is the venue's own (`markDiesel/brand.ts`);
 * there are no real team or sponsor marks.
 */

export const DIESEL_PRESETS: LightingPreset[] = ["roofClosed", "day", "night"];
/** Seated eye height above the tread. */
const EYE = 1.2;

/**
 * What a crowd wears in November: dark coats and hoodies, grays and
 * denim blues, and here and there a school color.
 */
const CLOTHES = [
    0x17181c, 0x17181c, 0x23262d, 0x2b2f3a, 0x1c2540, 0x1c2540, 0x2f4372,
    0x2f4372, 0x4b5568, 0x4b5568, 0x6f7480, 0x8d9096, 0xb4b3ad, 0xc8c6be,
    0x5c1f24, 0x7d2a2c, 0x1f4a86, 0x2e5137, 0x46305c, 0x6f6149, 0x2a5d61,
    0x8a5a2e,
];

/** A part that can show the show's credits (the drape, the video boards). */
type CreditsPart = DieselPart & { setCredits(credits: ShowCredits): void };
const showsCredits = (part: DieselPart): part is CreditsPart =>
    typeof (part as Partial<CreditsPart>).setCredits === "function";

export const buildMarkDiesel: KitBuilder = ({
    footprint: showFootprint,
    params,
    quality,
    fieldStyle,
}) => {
    // The stadium never shrinks below a football field. A floor (indoor,
    // SoundSport) lies at midfield of the stadium's own field; a football
    // field a little short of regulation (a small step) just gets more apron.
    const { footprint, grown } = fixedFieldFootprint(showFootprint);
    const ownField = grown && fieldStyle !== "turf";
    const shared = createSharedMaterials();
    const frame = dieselFrame(footprint);
    const { CENTER } = frame;
    const ctx: DieselCtx = { footprint, params, quality, shared, frame };

    const root = new Group();
    root.name = "kit.markDiesel";
    // The parts are built around the field center; this puts them on it.
    const placed = new Group();
    placed.name = "markDiesel.frame";
    placed.position.set(CENTER.x, 0, CENTER.z);
    root.add(placed);

    const bowl = buildDieselBowl(ctx);
    const parts: DieselPart[] = [
        buildDieselSite(ctx),
        buildDieselFacade(ctx),
        bowl,
        buildDieselRoof(ctx),
        buildDieselDrape(ctx),
        buildDieselBoards(ctx),
        buildDieselLighting(ctx),
        buildDieselTurf(ctx),
    ];
    parts.forEach((part) => placed.add(part.object));
    const field = ownField ? buildDieselOwnField(params, CENTER) : null;
    if (field) root.add(field.mesh);

    const fill = dieselCrowdFill(
        frame,
        dieselCameras(frame)
            .filter((seat) => seat.kind === "seat")
            .map((seat) => seat.position),
    );
    const shade = dieselCrowdShade(frame);
    const toWorld = ([x, y, z]: Vector3Tuple): Vector3Tuple => [
        x + CENTER.x,
        y,
        z + CENTER.z,
    ];
    const seatRows: SeatRow[] = bowl.seatRows.map((row) => ({
        ...row,
        points: row.points.map(toWorld),
    }));

    const setLighting = (preset: LightingPreset) => {
        if (!DIESEL_PRESETS.includes(preset)) return;
        parts.forEach((part) => part.setLighting(preset));
    };
    const defaultLighting: LightingPreset = "roofClosed";
    setLighting(defaultLighting);

    return {
        root,
        focus: toWorld([0, 0, 0]),
        cameras: dieselCameras(frame).map((seat) => ({
            ...seat,
            position: toWorld(seat.position),
            target: toWorld(seat.target),
        })),
        seatRows,
        pickTargets: parts.flatMap((part) => part.pickTargets ?? []),
        // The fill says how full each seat is; nothing scales it but quality.
        crowdDensity: 1,
        crowd: {
            style: "people",
            spacing: DIESEL_SEAT_PITCH,
            aisleEvery: 1e6,
            standing: 0.025,
            clearRadius: 3.4,
            clothes: CLOTHES,
            // The seat rows are in the scene's space; the bowl thinks in its
            // own, around the field center.
            fill: (x, y, z) => fill(x - CENTER.x, y, z - CENTER.z),
            shade: (x, y, z) => shade(x - CENTER.x, y, z - CENTER.z),
        },
        lightingPresets: [...DIESEL_PRESETS],
        defaultLighting,
        lightingVenue: DIESEL_VENUE,
        setLighting,
        setShowCredits(credits) {
            parts.filter(showsCredits).forEach((p) => p.setCredits(credits));
        },
        onFrame({ cameraPosition: [x, y, z], dt }) {
            const local = {
                cameraPosition: [x - CENTER.x, y, z - CENTER.z] as Vector3Tuple,
                dt,
            };
            parts.forEach((part) => part.onFrame?.(local));
        },
        dispose() {
            parts.forEach((part) => part.dispose());
            field?.dispose();
            shared.dispose();
            root.clear();
        },
    };
};

/**
 * Named cameras, in kit-root space. `lowerBowl` is the seat reference
 * photos 1 to 5 were taken from: the first row of the 200s on the front
 * sideline at the 50, behind the wheelchair platform, looking straight at
 * the drape. `judges` is the judges' level: the 400s at the 50.
 * `directors` is the band directors' viewing area: the upper rows of section
 * 139, one section south of the 50 in the 100s, under the cross-aisle wall
 * that carries the "director viewing area" sign (photos 10 and 13).
 */
export function dieselCameras(frame: DieselFrame): CameraSeat[] {
    const { BOWL, DRAPE, FIELD_HALF_WIDTH } = frame;
    const { lower, loge, mid, upperWest, northLower, pressBox, halfX, halfZ } =
        BOWL;
    const rowEye = (
        t: { base: number; rise: number; offset: number; depth: number },
        i: number,
    ) => ({
        y: t.base + i * t.rise + EYE,
        d: t.offset + (i + 0.45) * t.depth,
    });
    // The 50 is the middle of a section on both sidelines, off the aisles;
    // an end has two sections.
    const endSection = (halfZ - BOWL.outline.cornerRadius) / 2;
    const lowerRow = rowEye(loge, 0);
    const judgesRow = rowEye(mid, 2);
    // Row 15 of the 100s, the middle of section 139, the one south of the
    // 50 (the front straight holds seven; `dieselSectionNumber`). Photo 10,
    // solved from the yard lines, was taken standing a few rows higher:
    // eye 6.8 m up, 52.6 m from the field's center line, 12.3 m south of
    // the 50.
    const sectionWidth =
        (2 * (halfX - BOWL.outline.cornerRadius)) /
        (RING_PARTS[0].segments / DIESEL_SECTIONS.x);
    const directorsRow = rowEye(lower, 14);
    // Row 3, in front of the section's portal (rows 4 to 6): nothing between
    // it and the field but its own rail. Behind the portal its parapets cut
    // off the near sideline.
    const upperRow = rowEye(upperWest, 2);
    // The end zone: row 30 of the north end's tall lower stand (photo 11),
    // in the middle of a section. Its rows run unbroken from the field
    // wall up, so nothing stands between the seat and the field but the
    // heads in front. (Row 7 of the south 200s, where it was, sat right
    // behind a tunnel's lid, which filled the bottom of the view.)
    const endRow = rowEye(northLower, 29);
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
    return [
        // At the press box's glass, over the top row of the 600s' seats.
        cam(
            "pressBox",
            "seat",
            [0, pressBox.sill + 1.15, halfZ + pressBox.offset - 0.3],
            [0, 0, -6],
        ),
        cam(
            "judges",
            "seat",
            [0, judgesRow.y, halfZ + judgesRow.d],
            [0, 0, -5],
        ),
        cam(
            "directors",
            "seat",
            [sectionWidth, directorsRow.y, halfZ + directorsRow.d],
            [0, 6, -12],
        ),
        cam(
            "lowerBowl",
            "seat",
            [0, lowerRow.y, halfZ + lowerRow.d],
            [0, DRAPE.banner.y - 4, DRAPE.z],
        ),
        cam(
            "upper",
            "seat",
            [0, upperRow.y, halfZ + upperRow.d],
            [0, 0, -2],
            "upperDeck",
        ),
        cam(
            "endZone",
            "seat",
            [-(halfX + endRow.d), endRow.y, endSection],
            [0, 0, 0],
        ),
        cam(
            "sideline",
            "floor",
            [-6, 1.8, FIELD_HALF_WIDTH + 4.3],
            [3, 1.2, FIELD_HALF_WIDTH - 18],
        ),
        cam("blimp", "aerial", [-189, 195, 183], [0, 0, 0]),
        // A tiny +Z offset keeps the front at the bottom of the screen.
        cam("topDown", "topDown", [0, 300, 0.15], [0, 0, 0]),
    ];
}
