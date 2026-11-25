/**
 * The Small, Medium and Large front ensemble presets (instruments.md section 6, "Presets"): where
 * each piece of equipment goes and where its player stands, as a pure layout.
 *
 * Units and axes are the 3D world's (`@openmarch/core` `world.ts`): meters, the origin at the 50
 * on the front sideline, +x toward side 2 (right as the audience sees it), +z toward the
 * audience. The design's distances are in feet; {@link FEET} turns them into meters. Presets
 * ignore the venue, and the 5-yard lines are a football field's (15 ft apart from the 50).
 *
 * - The back line (field side) starts 3 ft out: the drum set at center, the xylophone and
 *   glockenspiel either side of it, racks and synths at the outer edges (with two of each, one of
 *   each per side).
 * - The keyboard row starts 3 ft past the back line's deepest item: marimbas in the center, vibes
 *   on each side, the odd one on the left. Neighbors in a row are 2 ft apart.
 * - Speakers stand on the keyboard row's line, one per side on consecutive 5-yard lines, from the
 *   first that is at least 2 ft past the end of the pit.
 * - The podium is on the 50, 3 ft past the keyboard row; the mixer 16 ft to the right, 6 ft past it.
 * - One player per instrument on its playing spot, facing the audience, and a Drum Major on the
 *   podium facing the field.
 */
import {
    defaultPitVariant,
    pitVariant,
    type PitFamilyId,
    type PitVariant,
} from "./catalog";
import { PLAYING_SPOT_TOLERANCE_M, playingSpotOf } from "./playingSpot";
import { worldToPixels, type FieldProperties, type XY } from "@openmarch/core";

/** One foot in meters */
export const FEET = 0.3048;

export const PIT_PRESET_SIZES = ["small", "medium", "large"] as const;
export type PitPresetSize = (typeof PIT_PRESET_SIZES)[number];

/** A piece of equipment a preset places */
export interface PitPresetEquipment {
    familyId: PitFamilyId;
    /** The variant's model id, what `items.model` stores (`pit/marimba-5.0`) */
    variantId: string;
    /** Its center, in meters (see the module comment) */
    x: number;
    z: number;
    /** Degrees, as an item's Outline turns */
    rotation: number;
}

/** A performer a preset adds */
export interface PitPresetPerformer {
    /** The section's name, as `marchers.section` stores it (`Drum Set`) */
    section: string;
    /** Where they stand, in meters */
    x: number;
    z: number;
    /** Degrees as an item turns: 0 faces the audience, 180 the field */
    facing: number;
}

export interface PitPreset {
    equipment: PitPresetEquipment[];
    performers: PitPresetPerformer[];
}

type Counts = Record<
    | "marimba"
    | "vibraphone"
    | "xylophone"
    | "glockenspiel"
    | "auxRack"
    | "drumSet"
    | "synth",
    number
> & {
    /** Speakers per side */
    speakerPairs: number;
};

/** The presets table of instruments.md section 6 */
const COUNTS: Record<PitPresetSize, Counts> = {
    small: {
        marimba: 2,
        vibraphone: 2,
        xylophone: 0,
        glockenspiel: 0,
        auxRack: 1,
        drumSet: 0,
        synth: 1,
        speakerPairs: 1,
    },
    medium: {
        marimba: 4,
        vibraphone: 3,
        xylophone: 1,
        glockenspiel: 1,
        auxRack: 1,
        drumSet: 1,
        synth: 1,
        speakerPairs: 2,
    },
    large: {
        marimba: 6,
        vibraphone: 4,
        xylophone: 1,
        glockenspiel: 1,
        auxRack: 2,
        drumSet: 1,
        synth: 2,
        speakerPairs: 3,
    },
};

/** The section a family's player is in; families nobody plays have none */
export const PIT_PLAYER_SECTIONS: Partial<Record<PitFamilyId, string>> = {
    marimba: "Marimba",
    vibraphone: "Vibraphone",
    xylophone: "Xylophone",
    glockenspiel: "Glockenspiel",
    drumSet: "Drum Set",
    auxRack: "Rack",
    synth: "Synthesizer",
};

/** The section of the performer on the podium */
export const DRUM_MAJOR_SECTION = "Drum Major";

const BACK_LINE_START = 3 * FEET;
const ROW_SPACING = 3 * FEET;
const GAP = 2 * FEET;
const SPEAKER_CLEARANCE = 2 * FEET;
const FIVE_YARDS = 15 * FEET;
const PODIUM_STANDOFF = 3 * FEET;
const MIXER_OFFSET_X = 16 * FEET;
const MIXER_STANDOFF = 6 * FEET;

/**
 * The marimba each size uses (owner, 2026-11-15): 4.3 octaves in Small and Medium, 4.6 in Large,
 * never the 5.0. Every other family, vibes included (always the 3.0), uses its default variant.
 */
const PRESET_MARIMBA: Record<PitPresetSize, string> = {
    small: "pit/marimba-4.3",
    medium: "pit/marimba-4.3",
    large: "pit/marimba-4.6",
};

/** The variant of `familyId` a `size` preset places */
export function presetVariant(
    familyId: PitFamilyId,
    size: PitPresetSize,
): PitVariant {
    if (familyId === "marimba") return pitVariant(PRESET_MARIMBA[size])!;
    return defaultPitVariant(familyId);
}

/** Picks each family's variant for one preset */
type VariantOf = (familyId: PitFamilyId) => PitVariant;

/** `familyId` repeated `count` times */
const times = (familyId: PitFamilyId, count: number): PitFamilyId[] =>
    Array<PitFamilyId>(count).fill(familyId);

/**
 * A row of families, left to right, 2 ft apart, their field-side edges on `near`: centered on the
 * 50, or with the family at `anchor` (an index) centered on it.
 */
function row(
    variantOf: VariantOf,
    families: readonly PitFamilyId[],
    near: number,
    anchor?: number,
) {
    const footprint = (f: PitFamilyId) => variantOf(f).footprint;
    const widths = families.map((f) => footprint(f).width);
    const lefts: number[] = [];
    let left = 0;
    for (const width of widths) {
        lefts.push(left);
        left += width + GAP;
    }
    const total = left - GAP;
    const shift =
        anchor === undefined
            ? -total / 2
            : -(lefts[anchor] + widths[anchor] / 2);
    const placed = families.map((familyId, i) =>
        at(
            variantOf(familyId),
            lefts[i] + shift + widths[i] / 2,
            near + footprint(familyId).depth / 2,
        ),
    );
    return { placed, halfWidth: Math.max(-shift, total + shift) };
}

function at(variant: PitVariant, x: number, z: number): PitPresetEquipment {
    return {
        familyId: variant.family,
        variantId: variant.modelId,
        x,
        z,
        rotation: 0,
    };
}

/** The back line, left to right: racks and synths at the edges, the rest around the drum set */
function backLineFamilies(counts: Counts): PitFamilyId[] {
    // The first rack on the left and the first synth on the right; a second of each on the other
    // side, outside the first
    const left: PitFamilyId[] = [
        ...times("synth", Math.max(0, counts.synth - 1)),
        ...times("auxRack", Math.min(1, counts.auxRack)),
    ];
    const right: PitFamilyId[] = [
        ...times("synth", Math.min(1, counts.synth)),
        ...times("auxRack", Math.max(0, counts.auxRack - 1)),
    ];
    const center = [
        ...times("xylophone", counts.xylophone),
        ...times("drumSet", counts.drumSet),
        ...times("glockenspiel", counts.glockenspiel),
    ];
    return [...left, ...center, ...right];
}

/** The keyboard row, left to right: marimbas in the center, the odd vibe on the left */
function keyboardRowFamilies(counts: Counts): PitFamilyId[] {
    return [
        ...times("vibraphone", Math.ceil(counts.vibraphone / 2)),
        ...times("marimba", counts.marimba),
        ...times("vibraphone", Math.floor(counts.vibraphone / 2)),
    ];
}

/** The order a preset's contents are listed in: keyboards, the back line, then the rest */
const CONTENTS_ORDER: readonly PitFamilyId[] = [
    "marimba",
    "vibraphone",
    "xylophone",
    "glockenspiel",
    "drumSet",
    "auxRack",
    "synth",
    "speaker",
    "podium",
    "mixer",
];

/** What a preset places, one entry per family with how many of it, podium and mixer included */
export function pitPresetContents(
    size: PitPresetSize,
): { familyId: PitFamilyId; count: number }[] {
    const counts = new Map<PitFamilyId, number>();
    for (const { familyId } of pitPreset(size).equipment)
        counts.set(familyId, (counts.get(familyId) ?? 0) + 1);
    const rank = (familyId: PitFamilyId) => {
        const i = CONTENTS_ORDER.indexOf(familyId);
        return i === -1 ? CONTENTS_ORDER.length : i;
    };
    return [...counts]
        .map(([familyId, count]) => ({ familyId, count }))
        .sort((a, b) => rank(a.familyId) - rank(b.familyId));
}

/** The equipment and performers of a preset, in meters from the 50 on the front sideline */
export function pitPreset(size: PitPresetSize): PitPreset {
    const counts = COUNTS[size];
    const variantOf: VariantOf = (familyId) => presetVariant(familyId, size);
    const footprint = (familyId: PitFamilyId) => variantOf(familyId).footprint;

    const backFamilies = backLineFamilies(counts);
    // The drum set at center when there is one, the rest packed out from it
    const drumSet = backFamilies.indexOf("drumSet");
    const back = row(
        variantOf,
        backFamilies,
        BACK_LINE_START,
        drumSet >= 0 ? drumSet : undefined,
    );
    const deepest = Math.max(...backFamilies.map((f) => footprint(f).depth));
    const keyboardNear = BACK_LINE_START + deepest + ROW_SPACING;
    const keyboardFamilies = keyboardRowFamilies(counts);
    const keyboards = row(variantOf, keyboardFamilies, keyboardNear);
    const keyboardFar =
        keyboardNear +
        Math.max(...keyboardFamilies.map((f) => footprint(f).depth));

    // Speakers: consecutive 5-yard lines from the first one clear of the pit
    const pitHalf = Math.max(back.halfWidth, keyboards.halfWidth);
    const firstLine =
        Math.ceil((pitHalf + SPEAKER_CLEARANCE) / FIVE_YARDS - 1e-9) *
        FIVE_YARDS;
    const speakerZ = keyboardNear + footprint("speaker").depth / 2;
    const speakers: PitPresetEquipment[] = [];
    for (let i = 0; i < counts.speakerPairs; i++)
        for (const side of [-1, 1])
            speakers.push(
                at(
                    variantOf("speaker"),
                    side * (firstLine + i * FIVE_YARDS),
                    speakerZ,
                ),
            );

    const podium = at(
        variantOf("podium"),
        0,
        keyboardFar + PODIUM_STANDOFF + footprint("podium").depth / 2,
    );
    const mixer = at(
        variantOf("mixer"),
        MIXER_OFFSET_X,
        keyboardFar + MIXER_STANDOFF + footprint("mixer").depth / 2,
    );

    const instruments = [...back.placed, ...keyboards.placed];
    const performers: PitPresetPerformer[] = instruments.map((e) => ({
        section: PIT_PLAYER_SECTIONS[e.familyId]!,
        ...playerSpot(e),
    }));
    performers.push({
        section: DRUM_MAJOR_SECTION,
        x: podium.x,
        z: podium.z,
        facing: 180,
    });

    return {
        equipment: [...instruments, ...speakers, podium, mixer],
        performers,
    };
}

/**
 * Where a player stands to play an instrument, and the way they face: its playing spot
 * (`playingSpotOf`), the one the 2D field marks and the 3D View snaps a player onto. The world's
 * z is the plan's y.
 */
function playerSpot(
    e: PitPresetEquipment,
): Pick<PitPresetPerformer, "x" | "z" | "facing"> {
    const spot = playingSpotOf(e.variantId, {
        center: { x: e.x, y: e.z },
        depth: pitVariant(e.variantId)!.footprint.depth,
        rotation: e.rotation,
    });
    if (!spot) throw new Error(`Nobody plays ${e.variantId}`);
    return { x: spot.x, z: spot.y, facing: spot.facing };
}

/** A preset's equipment on the canvas */
export interface PitPresetEquipmentOnCanvas extends PitPresetEquipment {
    /** Its center, `[x, y]` in canvas coordinates like a marcher's */
    home: XY;
}

/** A preset's performer on the canvas */
export interface PitPresetPerformerOnCanvas extends PitPresetPerformer {
    /** Where they stand, `[x, y]` in canvas coordinates */
    home: XY;
}

/** A preset placed on a field's canvas: its 50 on the front sideline at `centerFrontPoint` */
export function pitPresetOnCanvas(
    preset: PitPreset,
    field: FieldProperties,
): {
    equipment: PitPresetEquipmentOnCanvas[];
    performers: PitPresetPerformerOnCanvas[];
    /** How near a performer must stand to a spot to be on it, in canvas units: about a foot */
    reach: number;
} {
    const home = ({ x, z }: { x: number; z: number }): XY => {
        const p = worldToPixels(field, { x, z });
        return [p.x, p.y];
    };
    return {
        equipment: preset.equipment.map((e) => ({ ...e, home: home(e) })),
        performers: preset.performers.map((p) => ({ ...p, home: home(p) })),
        reach:
            worldToPixels(field, { x: PLAYING_SPOT_TOLERANCE_M, z: 0 }).x -
            field.centerFrontPoint.xPixels,
    };
}
