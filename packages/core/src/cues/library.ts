/**
 * The built-in cue library: metadata only (ADR 0015 D-3). The animation data
 * lives with the 3D View.
 */
import type {
    CueEquipment,
    EquipmentFamily,
    CueSettingField,
    CueType,
    CueValue,
    PerformerCarry,
} from "./types";

const choice = (
    key: string,
    options: readonly string[],
    fallback = options[0]!,
): CueSettingField => ({ key, kind: "choice", options, default: fallback });

const number = (key: string, fallback = 0): CueSettingField => ({
    key,
    kind: "number",
    default: fallback,
});

/** Every carry: values that fit any performer. */
export const ALL_CARRIES: readonly PerformerCarry[] = [
    "winds",
    "battery",
    "flag",
    "rifle",
    "sabre",
    "none",
];
/** Guard equipment: a Position value for one fits only performers holding it. */
export const GUARD_CARRIES: readonly PerformerCarry[] = [
    "flag",
    "rifle",
    "sabre",
];
const FLAG: readonly PerformerCarry[] = ["flag"];
const RIFLE: readonly PerformerCarry[] = ["rifle"];
const SABRE: readonly PerformerCarry[] = ["sabre"];

/** A value that is lasting unless its cue says otherwise. */
const lasting = (
    id: string,
    type: CueType,
    name: string,
    label: string,
    fits: readonly PerformerCarry[],
    extra: Partial<CueValue> = {},
): CueValue => ({ id: `builtin:${id}`, type, name, label, fits, ...extra });

/** A Position value that changes over `transition` counts (1 is a snap). */
const position = (
    id: string,
    name: string,
    label: string,
    fits: readonly PerformerCarry[],
    extra: Partial<CueValue> = {},
): CueValue =>
    lasting(id, "position", name, label, fits, {
        defaultTransition: 1,
        ...extra,
    });

/** A toss or spin: momentary only, for `length` counts unless its cue says. */
const toss = (
    id: string,
    name: string,
    label: string,
    fits: readonly PerformerCarry[],
    length: number,
): CueValue =>
    lasting(id, "position", name, label, fits, {
        natural: "momentary",
        locked: true,
        defaultLength: length,
    });

/** A Facing value: a turn over 2 counts unless its cue says. */
const facing = (
    id: string,
    name: string,
    label: string,
    extra: Partial<CueValue> = {},
): CueValue =>
    lasting(`facing.${id}`, "facing", name, label, ALL_CARRIES, {
        defaultTransition: 2,
        ...extra,
    });

/** The Equipment catalog's families, in the order menus list them. */
export const EQUIPMENT_FAMILIES: readonly EquipmentFamily[] = [
    "guard",
    "brass",
    "woodwinds",
    "drums",
];

/** An Equipment value that isn't a catalog item: Nothing, and the fallbacks below. */
const equipment = (
    key: string,
    holds: PerformerCarry | undefined,
    name: string,
    label: string,
): CueValue =>
    lasting(`equipment.${key}`, "equipment", name, label, ALL_CARRIES, {
        ...(holds ? { holds } : {}),
    });

/** A catalog item: a real piece of equipment any performer can hold, in its family. */
const item = (
    key: string,
    family: EquipmentFamily,
    holds: PerformerCarry,
    name: string,
): CueValue =>
    lasting(`equipment.${key}`, "equipment", name, name, ALL_CARRIES, {
        holds,
        family,
    });

/**
 * The Equipment catalog (ADR 0015 D-6; fork #992): every item a performer can
 * be given, by family. Each lines up with a 3D View model.
 */
const EQUIPMENT_CATALOG_VALUES: readonly CueValue[] = [
    item("flag", "guard", "flag", "Flag"),
    item("swingFlag", "guard", "flag", "Swing flag"),
    item("doubleSwingFlag", "guard", "flag", "Double swing flags"),
    item("rifle", "guard", "rifle", "Rifle"),
    item("sabre", "guard", "sabre", "Sabre"),
    item("trumpet", "brass", "winds", "Trumpet"),
    item("mellophone", "brass", "winds", "Mellophone"),
    item("baritone", "brass", "winds", "Baritone"),
    item("euphonium", "brass", "winds", "Euphonium"),
    item("trombone", "brass", "winds", "Trombone"),
    item("bassTrombone", "brass", "winds", "Bass trombone"),
    item("tuba", "brass", "winds", "Tuba"),
    item("sousaphone", "brass", "winds", "Sousaphone"),
    item("piccolo", "woodwinds", "winds", "Piccolo"),
    item("flute", "woodwinds", "winds", "Flute"),
    item("clarinet", "woodwinds", "winds", "Clarinet"),
    item("bassClarinet", "woodwinds", "winds", "Bass clarinet"),
    item("sopranoSax", "woodwinds", "winds", "Soprano sax"),
    item("altoSax", "woodwinds", "winds", "Alto sax"),
    item("tenorSax", "woodwinds", "winds", "Tenor sax"),
    item("bariSax", "woodwinds", "winds", "Bari sax"),
    item("snare", "drums", "battery", "Snare"),
    item("tenors", "drums", "battery", "Tenors"),
    item("bassDrum", "drums", "battery", "Bass drum"),
    item("cymbals", "drums", "battery", "Cymbals"),
];

/**
 * "Their own instrument": the performer's section default, whatever it is.
 * Compile resolves it to that default, so it never shows as itself.
 */
export const EQUIPMENT_USUAL = "builtin:equipment.usual";
/** Holding nothing. */
export const EQUIPMENT_NONE = "builtin:equipment.none";

/** The catalog's items, in family order; `family` narrows it to one family. */
export function equipmentCatalog(
    family?: EquipmentFamily,
): readonly CueValue[] {
    return family
        ? EQUIPMENT_CATALOG_VALUES.filter((v) => v.family === family)
        : EQUIPMENT_CATALOG_VALUES;
}

export const CUE_LIBRARY: readonly CueValue[] = [
    ...EQUIPMENT_CATALOG_VALUES,
    equipment("none", "none", "Nothing", "None"),
    equipment("usual", undefined, "Their own instrument", "Own"),
    // What a performer of a section without catalog equipment holds by
    // default (`defaultCueValue`); not in the catalog, so never set by hand
    equipment("winds", "winds", "Horn", "Horn"),
    equipment("battery", "battery", "Drum", "Drum"),
    position("horn.up", "Horns up", "HU", ["winds"], {
        settings: [choice("angle", ["box", "plus10"])],
    }),
    position("horn.down", "Horns down", "HD", ["winds"]),
    position("horn.trail", "Trail", "Trail", ["winds"]),
    position("battery.playing", "Playing", "Play", ["battery"]),
    position("battery.sticksIn", "Sticks in", "In", ["battery"]),
    position("battery.sticksDown", "Sticks down", "Down", ["battery"]),
    position("flag.set", "Flag set", "Set", FLAG),
    position("flag.port", "Flag port", "Port", FLAG),
    toss("flag.dropSpin", "Flag drop spin", "Drop", FLAG, 2),
    toss("flag.toss1", "Flag single toss", "1x", FLAG, 2),
    position("rifle.portArms", "Port arms", "Port", RIFLE),
    position("rifle.present", "Present", "Pres", RIFLE),
    toss("rifle.dropSpin", "Rifle drop spin", "Drop", RIFLE, 2),
    toss("rifle.toss1", "Rifle single toss", "1x", RIFLE, 2),
    toss("rifle.toss2", "Rifle double toss", "2x", RIFLE, 2),
    position("sabre.set", "Sabre set", "Set", SABRE),
    toss("sabre.toss1", "Sabre single toss", "1x", SABRE, 2),
    lasting("silk.plain", "silk", "Plain silk", "Plain", FLAG),
    lasting("look.band", "look", "Band look", "Band", ALL_CARRIES),
    lasting("look.guard", "look", "Guard look", "Guard", ALL_CARRIES),
    facing("front", "Front", "Front"),
    facing("back", "Back", "Back"),
    facing("side1", "Side 1", "S1"),
    facing("side2", "Side 2", "S2"),
    facing("travel", "Direction of travel", "Travel"),
    facing("angle", "Angle", "Angle", { settings: [number("degrees")] }),
    facing("point", "Toward a point", "Point", {
        settings: [number("x"), number("y")],
    }),
    lasting("posture.neutral", "posture", "Neutral", "—", ALL_CARRIES, {
        defaultTransition: 1,
    }),
    lasting("posture.kneel", "posture", "Kneel", "Kneel", ALL_CARRIES, {
        defaultTransition: 3,
        standingOnly: true,
    }),
];

const BY_ID = new Map(CUE_LIBRARY.map((v) => [v.id, v]));

export function cueLibraryValue(id: string): CueValue | undefined {
    return BY_ID.get(id);
}

/** Looks a cue value up in the built-in library or the values the show adds. */
export type CueValueLookup = (id: string) => CueValue | undefined;

/** A piece of equipment as an Equipment value. */
export function equipmentValue(item: CueEquipment): CueValue {
    return {
        id: item.id,
        type: "equipment",
        name: item.name,
        label: item.label ?? item.name,
        fits: ALL_CARRIES,
        holds: item.holds,
    };
}

/**
 * A lookup over the built-ins plus the values the show adds. A built-in wins
 * over an added value of the same id, and of two added values the first.
 */
export function cueValueLookup(
    added: readonly CueValue[] = [],
): CueValueLookup {
    const shown = new Map<string, CueValue>();
    for (const value of added)
        if (!shown.has(value.id)) shown.set(value.id, value);
    return (id) => BY_ID.get(id) ?? shown.get(id);
}

/** A value's settings: its defaults, overridden by the cue's own. */
export function cueSettings(
    value: CueValue | undefined,
    own: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of value?.settings ?? []) out[field.key] = field.default;
    return { ...out, ...own };
}

const DEFAULT_POSITION: Record<PerformerCarry, string | null> = {
    winds: "builtin:horn.up",
    battery: "builtin:battery.playing",
    flag: "builtin:flag.set",
    rifle: "builtin:rifle.portArms",
    sabre: "builtin:sabre.set",
    none: null,
};

/**
 * The built-in default, never stored, of a cue type for what a performer
 * holds. Compile refines Equipment (the section's usual equipment) and Look
 * (the guard default) from its input.
 */
export function defaultCueValue(
    type: CueType,
    holds: PerformerCarry,
): string | null {
    switch (type) {
        case "equipment":
            return `builtin:equipment.${holds}`;
        case "position":
            return DEFAULT_POSITION[holds];
        case "silk":
            return "builtin:silk.plain";
        case "look":
            return "builtin:look.band";
        case "facing":
            return "builtin:facing.front";
        case "posture":
            return "builtin:posture.neutral";
    }
}
