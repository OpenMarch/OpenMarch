/**
 * The front ensemble catalog (instruments.md §6, ADR 0010 amendment of 2026-11-11): the built-in
 * pit models offered as equipment, picked as a family, then a variant. Derived from the pit
 * models' `manifest.json`, so a rebuilt model set shows up here without a list to keep in step.
 *
 * - A model id names a file in `assets/pit/` as `pit/<file id>` (`pitModelId`), and is what
 *   `items.model` stores.
 * - A variant's footprint is the detailed model's size, in meters like an item's geometry:
 *   width along the field's x, depth toward the audience, as the models are built (+Z toward the
 *   audience).
 * - Amps are built but not offered yet.
 * - The podiums (the conductor podium and the drum major's stand, towers, rolling podium,
 *   stepladder and scaffold, #838) are their own group: stood on, not played.
 *
 * Labels are i18n keys with parameters, so this stays free of the UI.
 */
import manifest from "@/view3d/assets/pit/manifest.json";

/** The prefix of a built-in pit model's id, before its file id */
const PIT_PREFIX = "pit/";

export type PitFamilyId =
    | "marimba"
    | "vibraphone"
    | "xylophone"
    | "glockenspiel"
    | "synth"
    | "drumSet"
    | "auxRack"
    | "timpani"
    | "chimes"
    | "gong"
    | "congas"
    | "bongos"
    | "concertBassDrum"
    | "trapTable"
    | "speaker"
    | "mixer"
    | "podium"
    | "podiumStand"
    | "podiumTower"
    | "rollingPodium"
    | "stepladder"
    | "scaffold";

/** How the Front ensemble panel groups families */
export type PitGroup = "keyboards" | "percussion" | "audio" | "podiums";

export interface PitFamily {
    id: PitFamilyId;
    group: PitGroup;
    /** i18n key of the family's name, also a new item's name ("Marimba 2") */
    labelKey: string;
    /**
     * Whether someone plays it, standing on its playing spot (`pit/playingSpot.ts`): the
     * keyboards and percussion, not the audio group's speakers and mixer or the podiums
     */
    played: boolean;
}

/** One part of a variant's label: an i18n key and its parameters */
export interface PitLabelPart {
    key: string;
    params?: Record<string, string>;
}

/** A model's footprint and height, in meters */
export interface PitFootprint {
    width: number;
    depth: number;
    height: number;
}

export interface PitVariant {
    /** The file in `assets/pit/`, without `.glb` */
    fileId: string;
    /** What `items.model` stores: `pit/<file id>` */
    modelId: string;
    family: PitFamilyId;
    /** Its size, then its finish or style; empty for a family with one model */
    label: readonly PitLabelPart[];
    footprint: PitFootprint;
}

interface FamilySpec {
    id: PitFamilyId;
    group: PitGroup;
    /** The file ids are this stem alone or followed by `-` and the variant's words */
    stem: string;
    defaultFileId: string;
    /** The unit of the size in the file id */
    size?: "octaves" | "inches" | "keys" | "feet";
    /** The label part of a variant whose file id names no finish or style */
    plain?: string;
}

const FAMILY_SPECS: readonly FamilySpec[] = [
    {
        id: "marimba",
        group: "keyboards",
        stem: "marimba",
        // The size most pits own; the 5.0 is the big, rarer one (owner, 2026-11-15)
        defaultFileId: "marimba-4.3",
        size: "octaves",
        plain: "rosewood",
    },
    {
        id: "vibraphone",
        group: "keyboards",
        stem: "vibraphone",
        // Always the 3.0 unless asked for the 3.5 (owner, 2026-11-15)
        defaultFileId: "vibraphone-3.0",
        size: "octaves",
        plain: "silver",
    },
    {
        id: "xylophone",
        group: "keyboards",
        stem: "xylophone",
        defaultFileId: "xylophone-3.5",
        size: "octaves",
        plain: "rosewood",
    },
    {
        id: "glockenspiel",
        group: "keyboards",
        stem: "glockenspiel",
        defaultFileId: "glockenspiel-2.5",
        size: "octaves",
    },
    {
        id: "synth",
        group: "keyboards",
        stem: "synth",
        defaultFileId: "synth-88",
        size: "keys",
        plain: "single",
    },
    {
        id: "drumSet",
        group: "percussion",
        stem: "drum-set",
        defaultFileId: "drum-set",
        plain: "plain",
    },
    {
        id: "auxRack",
        group: "percussion",
        stem: "aux-rack",
        defaultFileId: "aux-rack-mixed",
    },
    {
        id: "timpani",
        group: "percussion",
        stem: "timpani",
        defaultFileId: "timpani-29",
        size: "inches",
    },
    {
        id: "chimes",
        group: "percussion",
        stem: "chimes",
        defaultFileId: "chimes",
    },
    {
        id: "gong",
        group: "percussion",
        stem: "gong",
        defaultFileId: "gong-36",
        size: "inches",
    },
    {
        id: "congas",
        group: "percussion",
        stem: "congas",
        defaultFileId: "congas",
    },
    {
        id: "bongos",
        group: "percussion",
        stem: "bongos",
        defaultFileId: "bongos",
    },
    {
        id: "concertBassDrum",
        group: "percussion",
        stem: "concert-bass",
        defaultFileId: "concert-bass-32",
        size: "inches",
    },
    {
        id: "trapTable",
        group: "percussion",
        stem: "trap-table",
        defaultFileId: "trap-table",
    },
    {
        id: "speaker",
        group: "audio",
        stem: "speaker",
        defaultFileId: "speaker-tall",
    },
    {
        id: "mixer",
        group: "audio",
        stem: "mixer-cart",
        defaultFileId: "mixer-cart",
        plain: "open",
    },
    {
        id: "podium",
        group: "podiums",
        stem: "conductor-podium",
        defaultFileId: "conductor-podium",
        plain: "low",
    },
    {
        id: "podiumStand",
        group: "podiums",
        stem: "podium-stand",
        defaultFileId: "podium-stand-2ft",
        size: "feet",
        plain: "aluminum",
    },
    {
        id: "podiumTower",
        group: "podiums",
        stem: "podium-tower",
        defaultFileId: "podium-tower-5ft",
        size: "feet",
        plain: "aluminum",
    },
    {
        id: "rollingPodium",
        group: "podiums",
        stem: "podium-rolling",
        defaultFileId: "podium-rolling-6ft",
        size: "feet",
        plain: "aluminum",
    },
    {
        id: "stepladder",
        group: "podiums",
        stem: "stepladder",
        defaultFileId: "stepladder-6ft",
        size: "feet",
    },
    {
        id: "scaffold",
        group: "podiums",
        stem: "scaffold-tower",
        defaultFileId: "scaffold-tower",
    },
];

/** Size words in file ids that carry their unit ("6ft"), and the unit to drop from them */
const SIZE_SUFFIX: Partial<Record<NonNullable<FamilySpec["size"]>, string>> = {
    feet: "ft",
};

/** File-id words, as the label parts they read as */
const WORDS: Readonly<Record<string, string>> = {
    "synthetic-black": "syntheticBlack",
};

type ManifestEntry = {
    high: { sizeM: { width: number; depth: number; height: number } };
};
const MODELS = manifest as Readonly<Record<string, ManifestEntry>>;

/** `pit/<file id>`: what `items.model` stores for a built-in pit model */
export const pitModelId = (fileId: string): string => `${PIT_PREFIX}${fileId}`;

/** The file id of a built-in pit model id, or null for any other id or none */
export function pitFileId(modelId: string | null | undefined): string | null {
    if (!modelId?.startsWith(PIT_PREFIX)) return null;
    const fileId = modelId.slice(PIT_PREFIX.length);
    return fileId || null;
}

const variantKey = (key: string): string => `pit.variant.${key}`;

function variantOf(spec: FamilySpec, fileId: string): PitVariant {
    const rest = fileId === spec.stem ? "" : fileId.slice(spec.stem.length + 1);
    const tokens = rest ? rest.split("-") : [];
    const label: PitLabelPart[] = [];
    if (spec.size && tokens.length > 0) {
        const suffix = SIZE_SUFFIX[spec.size];
        const word = tokens.shift()!;
        label.push({
            key: variantKey(spec.size),
            params: {
                size:
                    suffix && word.endsWith(suffix)
                        ? word.slice(0, -suffix.length)
                        : word,
            },
        });
    }
    const words = tokens.join("-");
    if (words) label.push({ key: variantKey(WORDS[words] ?? words) });
    else if (spec.plain) label.push({ key: variantKey(spec.plain) });
    const { width, depth, height } = MODELS[fileId].high.sizeM;
    return {
        fileId,
        modelId: pitModelId(fileId),
        family: spec.id,
        label,
        footprint: { width, depth, height },
    };
}

/** Smaller first, then the plain finish before the others */
function compareVariants(a: PitVariant, b: PitVariant): number {
    const size = (v: PitVariant) =>
        Number(v.label.find((p) => p.params?.size)?.params?.size ?? 0);
    return size(a) - size(b) || a.fileId.localeCompare(b.fileId);
}

const VARIANTS: ReadonlyMap<PitFamilyId, readonly PitVariant[]> = new Map(
    FAMILY_SPECS.map((spec) => [
        spec.id,
        Object.keys(MODELS)
            .filter(
                (fileId) =>
                    fileId === spec.stem || fileId.startsWith(`${spec.stem}-`),
            )
            .map((fileId) => variantOf(spec, fileId))
            .sort(compareVariants),
    ]),
);

const BY_FILE_ID: ReadonlyMap<string, PitVariant> = new Map(
    [...VARIANTS.values()].flat().map((v) => [v.fileId, v]),
);

/** The families offered, in the order the Front ensemble panel lists them */
export const PIT_FAMILIES: readonly PitFamily[] = FAMILY_SPECS.map(
    ({ id, group }) => ({
        id,
        group,
        labelKey: `pit.family.${id}`,
        played: group === "keyboards" || group === "percussion",
    }),
);

/** Whether a family is a podium: stood on by a conductor or drum major, not played */
export const isPodiumFamily = (family: PitFamilyId): boolean =>
    FAMILY_SPECS.find((s) => s.id === family)?.group === "podiums";

/** A family's variants, smaller first */
export const pitVariantsOf = (family: PitFamilyId): readonly PitVariant[] =>
    VARIANTS.get(family) ?? [];

/** The variant a family adds unless another is picked */
export function defaultPitVariant(family: PitFamilyId): PitVariant {
    const spec = FAMILY_SPECS.find((s) => s.id === family)!;
    return BY_FILE_ID.get(spec.defaultFileId)!;
}

/** The offered variant an item's model names, or null for a block, an amp or an unknown model */
export const pitVariant = (
    modelId: string | null | undefined,
): PitVariant | null => BY_FILE_ID.get(pitFileId(modelId) ?? "") ?? null;

/** The family of the offered variant an item's model names, or null */
export function pitFamily(
    modelId: string | null | undefined,
): PitFamily | null {
    const variant = pitVariant(modelId);
    return variant
        ? (PIT_FAMILIES.find((f) => f.id === variant.family) ?? null)
        : null;
}
