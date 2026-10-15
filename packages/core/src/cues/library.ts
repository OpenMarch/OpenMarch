// cspell:words choreo

/**
 * The built-in cue library v1: metadata only (docs/3d/performer-behavior.md
 * section 4). The animation data lives with the 3D View.
 */
import type {
    CueChannel,
    CueLibraryItem,
    CueShowDefaults,
    PerformerCarry,
    ShowPhraseAsset,
} from "./types";

/** One setting a value takes, with its default. */
export type CueSettingField =
    | {
          key: string;
          kind: "choice";
          options: readonly string[];
          default: string;
      }
    | { key: string; kind: "number"; default: number };

export interface CueLibraryValue {
    id: string;
    channel: CueChannel;
    kind: "state" | "phrase";
    name: string;
    label: string;
    /** Who it fits; a cue skips everyone else. */
    fits: readonly PerformerCarry[];
    /** Other channels it owns while it applies. */
    takesOver?: readonly CueChannel[];
    /** States: the default transition length in counts (1 is a snap). */
    defaultTransition?: number;
    /** Phrases: the lengths it stretches to. */
    minLength?: number;
    maxLength?: number;
    /** Only valid while the dot holds. */
    standingOnly?: boolean;
    /** The settings it takes; a cue's missing settings get these defaults. */
    settings?: readonly CueSettingField[];
    /** Carry values: what holding it counts as. */
    holds?: PerformerCarry;
}

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

const FEET_SETTINGS: readonly CueSettingField[] = [
    choice("pace", ["single", "half", "double"]),
    choice("moving", ["straightLeg", "bentLeg", "highStep"]),
    choice("onHolds", ["stand", "markTime", "highMarkTime"]),
    choice("stepOffFoot", ["left", "right"]),
];

/** Every carry: values that fit any performer. */
export const ALL_CARRIES: readonly PerformerCarry[] = [
    "winds",
    "battery",
    "flag",
    "rifle",
    "sabre",
    "none",
];
/** Guard equipment: a Horn/Equipment value for one fits only performers holding it. */
export const GUARD_CARRIES: readonly PerformerCarry[] = [
    "flag",
    "rifle",
    "sabre",
];
const FLAG: readonly PerformerCarry[] = ["flag"];
const RIFLE: readonly PerformerCarry[] = ["rifle"];
const SABRE: readonly PerformerCarry[] = ["sabre"];

const state = (
    id: string,
    channel: CueChannel,
    name: string,
    label: string,
    fits: readonly PerformerCarry[],
    defaultTransition = 1,
    extra: Partial<CueLibraryValue> = {},
): CueLibraryValue => ({
    id: `builtin:${id}`,
    channel,
    kind: "state",
    name,
    label,
    fits,
    defaultTransition,
    ...extra,
});

const phrase = (
    id: string,
    channel: CueChannel,
    name: string,
    label: string,
    fits: readonly PerformerCarry[],
    minLength: number,
    maxLength: number,
    extra: Partial<CueLibraryValue> = {},
): CueLibraryValue => ({
    id: `builtin:${id}`,
    channel,
    kind: "phrase",
    name,
    label,
    fits,
    minLength,
    maxLength,
    ...extra,
});

/** A Carry, Silk or Uniform value: a state that cuts, never a transition. */
const look = (
    id: string,
    channel: CueChannel,
    name: string,
    label: string,
    fits: readonly PerformerCarry[] = ALL_CARRIES,
): CueLibraryValue => state(id, channel, name, label, fits, 1);

export const CUE_LIBRARY: readonly CueLibraryValue[] = [
    state("feet.step", "feet", "Step", "Step", ALL_CARRIES, 1, {
        settings: FEET_SETTINGS,
    }),
    state("horn.up", "horn_equipment", "Horns up", "HU", ["winds"], 1, {
        settings: [choice("angle", ["box", "plus10"])],
    }),
    state("horn.down", "horn_equipment", "Horns down", "HD", ["winds"]),
    state("horn.trail", "horn_equipment", "Trail", "Trail", ["winds"]),
    state("battery.playing", "horn_equipment", "Playing", "Play", ["battery"]),
    state("battery.sticksIn", "horn_equipment", "Sticks in", "In", ["battery"]),
    state("battery.sticksDown", "horn_equipment", "Sticks down", "Down", [
        "battery",
    ]),
    state("flag.set", "horn_equipment", "Flag set", "Set", FLAG),
    state("flag.port", "horn_equipment", "Flag port", "Port", FLAG),
    phrase(
        "flag.dropSpin",
        "horn_equipment",
        "Flag drop spin",
        "Drop",
        FLAG,
        2,
        16,
    ),
    phrase(
        "flag.toss1",
        "horn_equipment",
        "Flag single toss",
        "1x",
        FLAG,
        2,
        8,
    ),
    state("rifle.portArms", "horn_equipment", "Port arms", "Port", RIFLE),
    state("rifle.present", "horn_equipment", "Present", "Pres", RIFLE),
    phrase(
        "rifle.dropSpin",
        "horn_equipment",
        "Rifle drop spin",
        "Drop",
        RIFLE,
        2,
        16,
    ),
    phrase(
        "rifle.toss1",
        "horn_equipment",
        "Rifle single toss",
        "1x",
        RIFLE,
        2,
        8,
    ),
    phrase(
        "rifle.toss2",
        "horn_equipment",
        "Rifle double toss",
        "2x",
        RIFLE,
        2,
        8,
    ),
    state("sabre.set", "horn_equipment", "Sabre set", "Set", SABRE),
    phrase(
        "sabre.toss1",
        "horn_equipment",
        "Sabre single toss",
        "1x",
        SABRE,
        2,
        8,
    ),
    state("facing.front", "facing", "Front", "Front", ALL_CARRIES, 2),
    state("facing.back", "facing", "Back", "Back", ALL_CARRIES, 2),
    state("facing.side1", "facing", "Side 1", "S1", ALL_CARRIES, 2),
    state("facing.side2", "facing", "Side 2", "S2", ALL_CARRIES, 2),
    state(
        "facing.travel",
        "facing",
        "Direction of travel",
        "Travel",
        ALL_CARRIES,
        2,
    ),
    state("facing.angle", "facing", "Angle", "Angle", ALL_CARRIES, 2, {
        settings: [number("degrees")],
    }),
    state("facing.point", "facing", "Toward a point", "Point", ALL_CARRIES, 2, {
        settings: [number("x"), number("y")],
    }),
    state("body.neutral", "body", "Neutral", "—", ALL_CARRIES),
    state("body.kneel", "body", "Kneel", "Kneel", ALL_CARRIES, 3, {
        takesOver: ["feet"],
        standingOnly: true,
    }),
    phrase("body.choreo", "body", "Choreography", "Choreo", ALL_CARRIES, 8, 8, {
        takesOver: ["horn_equipment"],
        settings: [choice("energy", ["low", "medium", "high"], "medium")],
    }),
    // Carry, Silk and Uniform: the values compile falls back to. Cues name
    // Library items (`library:<uuid>@<version hash>`) or Carry's `none`.
    { ...look("none", "carry", "Nothing", "None"), id: "none", holds: "none" },
    { ...look("carry.winds", "carry", "Horn", "Horn"), holds: "winds" },
    { ...look("carry.battery", "carry", "Drum", "Drum"), holds: "battery" },
    { ...look("carry.flag", "carry", "Flag", "Flag"), holds: "flag" },
    { ...look("carry.rifle", "carry", "Rifle", "Rifle"), holds: "rifle" },
    { ...look("carry.sabre", "carry", "Sabre", "Sabre"), holds: "sabre" },
    look("silk.plain", "silk", "Plain silk", "Plain", FLAG),
    look("uniform.band", "uniform", "Band uniform", "Band"),
    look("uniform.guard", "uniform", "Guard uniform", "Guard"),
];

const BY_ID = new Map(CUE_LIBRARY.map((v) => [v.id, v]));

export function cueLibraryValue(id: string): CueLibraryValue | undefined {
    return BY_ID.get(id);
}

/** Looks a cue value up in the built-in library or the show's phrase assets. */
export type CueValueLookup = (id: string) => CueLibraryValue | undefined;

/** A Library item as a Carry, Silk or Uniform value. */
function itemValue(item: CueLibraryItem): CueLibraryValue {
    const channel = item.channel;
    return {
        id: item.id,
        channel,
        kind: "state",
        name: item.name,
        label: item.label ?? item.name,
        fits: channel === "silk" ? FLAG : ALL_CARRIES,
        defaultTransition: 1,
        ...(item.holds ? { holds: item.holds } : {}),
    };
}

/**
 * A lookup over the built-ins plus the show's phrase assets, which fit every
 * performer and take over every channel they list, and the Library items
 * and equipment that Carry, Silk and Uniform values name. A built-in wins
 * over an item of the same id.
 */
export function cueValueLookup(
    phraseAssets: readonly ShowPhraseAsset[] = [],
    showDefaults: CueShowDefaults = {},
    items: readonly CueLibraryItem[] = [],
): CueValueLookup {
    const feet = BY_ID.get("builtin:feet.step")!;
    const showFeet: CueLibraryValue = {
        ...feet,
        settings: feet.settings!.map((field) =>
            field.kind === "choice" &&
            field.key === "stepOffFoot" &&
            showDefaults.stepOffFoot
                ? { ...field, default: showDefaults.stepOffFoot }
                : field,
        ),
    };
    const shown = new Map<string, CueLibraryValue>(
        phraseAssets.map((asset) => [
            `show:${asset.id}`,
            {
                id: `show:${asset.id}`,
                channel: asset.channels[0] ?? "body",
                kind: "phrase",
                name: asset.name,
                label: asset.label,
                fits: ALL_CARRIES,
                takesOver: asset.channels,
                minLength: 2,
            },
        ]),
    );
    for (const item of items)
        if (!shown.has(item.id)) shown.set(item.id, itemValue(item));
    return (id) =>
        id === feet.id ? showFeet : (BY_ID.get(id) ?? shown.get(id));
}

/** A value's settings: its defaults, overridden by the cue's own. */
export function cueSettings(
    value: CueLibraryValue | undefined,
    own: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of value?.settings ?? []) out[field.key] = field.default;
    return { ...out, ...own };
}

const DEFAULT_CARRY_VALUE: Record<PerformerCarry, string | null> = {
    winds: "builtin:horn.up",
    battery: "builtin:battery.playing",
    flag: "builtin:flag.set",
    rifle: "builtin:rifle.portArms",
    sabre: "builtin:sabre.set",
    none: null,
};

/**
 * The built-in default, never stored, on a channel for what a performer
 * carries. Compile refines Carry (the section's usual equipment) and
 * Uniform (the guard default) from its input.
 */
export function defaultCueValue(
    channel: CueChannel,
    carries: PerformerCarry,
): string | null {
    switch (channel) {
        case "carry":
            return carries === "none" ? "none" : `builtin:carry.${carries}`;
        case "silk":
            return "builtin:silk.plain";
        case "uniform":
            return "builtin:uniform.band";
        case "feet":
            return "builtin:feet.step";
        case "horn_equipment":
            return DEFAULT_CARRY_VALUE[carries];
        case "facing":
            return "builtin:facing.front";
        case "body":
            return "builtin:body.neutral";
    }
}
