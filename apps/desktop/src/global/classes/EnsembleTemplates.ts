import { SECTIONS, getSectionObjectByName } from "@/global/classes/Sections";
import { NewMarcherArgs } from "@/db-functions";
import { ACTIVITIES, type ActivityLabel } from "@/global/classes/Activities";

type PresetTable = Record<string, [number, number, number]>;

export const ENSEMBLE_SIZES = ["Small", "Medium", "Large"] as const;
export type EnsembleSize = (typeof ENSEMBLE_SIZES)[number];

export const DEFAULT_ENSEMBLE_SIZE: EnsembleSize = "Medium";

// Outer keys come from ACTIVITIES, section keys from SECTIONS, so both stay in sync with their definitions.
// Each value is [Small, Medium, Large] counts. A 0 means the section is absent at that size.
export const ENSEMBLE_PRESETS: Record<ActivityLabel, PresetTable> = {
    [ACTIVITIES.MarchingBand.label]: {
        [SECTIONS.Flute.name]: [4, 6, 10],
        [SECTIONS.Clarinet.name]: [5, 8, 12],
        [SECTIONS.AltoSax.name]: [2, 4, 6],
        [SECTIONS.TenorSax.name]: [1, 2, 3],
        [SECTIONS.Trumpet.name]: [5, 8, 12],
        [SECTIONS.Mellophone.name]: [2, 4, 6],
        [SECTIONS.Trombone.name]: [2, 4, 6],
        [SECTIONS.Baritone.name]: [2, 4, 6],
        [SECTIONS.Tuba.name]: [2, 4, 6],
        [SECTIONS.Snare.name]: [2, 4, 6],
        [SECTIONS.Tenors.name]: [1, 3, 4],
        [SECTIONS.BassDrum.name]: [3, 4, 5],
        [SECTIONS.Cymbals.name]: [0, 2, 3],
        [SECTIONS.Marimba.name]: [1, 2, 2],
        [SECTIONS.Vibraphone.name]: [0, 1, 2],
        [SECTIONS.ColorGuard.name]: [6, 10, 16],
        [SECTIONS.DrumMajor.name]: [1, 2, 2],
    },
    [ACTIVITIES.DrumCorps.label]: {
        [SECTIONS.Trumpet.name]: [8, 12, 24],
        [SECTIONS.Mellophone.name]: [4, 6, 16],
        [SECTIONS.Baritone.name]: [4, 6, 16],
        [SECTIONS.Euphonium.name]: [2, 3, 8],
        [SECTIONS.Tuba.name]: [4, 5, 16],
        [SECTIONS.Snare.name]: [4, 6, 9],
        [SECTIONS.Tenors.name]: [3, 4, 5],
        [SECTIONS.BassDrum.name]: [4, 5, 5],
        [SECTIONS.Marimba.name]: [2, 2, 3],
        [SECTIONS.Vibraphone.name]: [1, 2, 2],
        [SECTIONS.Xylophone.name]: [0, 1, 1],
        [SECTIONS.AuxPercussion.name]: [0, 1, 2],
        [SECTIONS.Synthesizer.name]: [1, 1, 2],
        [SECTIONS.ColorGuard.name]: [10, 16, 24],
        [SECTIONS.DrumMajor.name]: [1, 1, 2],
    },
    [ACTIVITIES.SoundSport.label]: {
        [SECTIONS.Trumpet.name]: [3, 5, 7],
        [SECTIONS.Mellophone.name]: [1, 2, 3],
        [SECTIONS.Baritone.name]: [2, 3, 4],
        [SECTIONS.Tuba.name]: [1, 2, 3],
        [SECTIONS.Snare.name]: [2, 3, 4],
        [SECTIONS.Tenors.name]: [1, 1, 2],
        [SECTIONS.BassDrum.name]: [1, 2, 3],
        [SECTIONS.Marimba.name]: [1, 1, 2],
        [SECTIONS.ColorGuard.name]: [3, 5, 8],
        [SECTIONS.DrumMajor.name]: [0, 1, 1],
    },
    [ACTIVITIES.WinterGuard.label]: {
        [SECTIONS.ColorGuard.name]: [10, 16, 24],
        [SECTIONS.Rifle.name]: [2, 4, 6],
        [SECTIONS.Dancer.name]: [0, 2, 4],
    },
    [ACTIVITIES.IndoorPercussion.label]: {
        [SECTIONS.Snare.name]: [4, 6, 8],
        [SECTIONS.Tenors.name]: [2, 3, 4],
        [SECTIONS.BassDrum.name]: [4, 5, 5],
        [SECTIONS.Cymbals.name]: [0, 2, 2],
        [SECTIONS.Marimba.name]: [2, 3, 4],
        [SECTIONS.Vibraphone.name]: [1, 2, 3],
        [SECTIONS.Xylophone.name]: [1, 1, 2],
        [SECTIONS.AuxPercussion.name]: [1, 2, 3],
        [SECTIONS.Synthesizer.name]: [1, 1, 2],
    },
    [ACTIVITIES.IndoorWinds.label]: {
        [SECTIONS.Flute.name]: [2, 3, 4],
        [SECTIONS.Clarinet.name]: [3, 4, 6],
        [SECTIONS.AltoSax.name]: [2, 3, 4],
        [SECTIONS.TenorSax.name]: [1, 2, 2],
        [SECTIONS.Trumpet.name]: [3, 4, 6],
        [SECTIONS.Mellophone.name]: [1, 2, 3],
        [SECTIONS.Trombone.name]: [2, 3, 4],
        [SECTIONS.Baritone.name]: [1, 2, 3],
        [SECTIONS.Tuba.name]: [1, 2, 3],
        [SECTIONS.Marimba.name]: [1, 2, 3],
        [SECTIONS.Vibraphone.name]: [1, 1, 2],
        [SECTIONS.AuxPercussion.name]: [1, 1, 2],
        [SECTIONS.Synthesizer.name]: [1, 1, 1],
    },
    [ACTIVITIES.Other.label]: {},
};

// Section and count for an activity/size, dropping zero-count sections
export function getEnsemblePreset(
    activity: string | undefined,
    size: EnsembleSize,
): { section: string; count: number }[] {
    const table: PresetTable | undefined = activity
        ? ENSEMBLE_PRESETS[activity as ActivityLabel]
        : undefined;
    if (!table) return [];
    const sizeIndex = ENSEMBLE_SIZES.indexOf(size);
    const result: { section: string; count: number }[] = [];
    for (const [section, counts] of Object.entries(table)) {
        const count = counts[sizeIndex];
        if (count > 0) result.push({ section, count });
    }
    return result;
}

// Total performer count for an activity/size preset
export function getEnsemblePresetTotal(
    activity: string | undefined,
    size: EnsembleSize,
): number {
    return getEnsemblePreset(activity, size).reduce(
        (total, { count }) => total + count,
        0,
    );
}

// Expands a preset into marchers, numbering drill_order 1..N within each section
export function getPresetMarchers(
    activity: string | undefined,
    size: EnsembleSize,
): NewMarcherArgs[] {
    const marchers: NewMarcherArgs[] = [];
    for (const { section, count } of getEnsemblePreset(activity, size)) {
        const prefix = getSectionObjectByName(section).prefix;
        for (let order = 1; order <= count; order++) {
            marchers.push({
                section,
                drill_prefix: prefix,
                drill_order: order,
            });
        }
    }
    return marchers;
}

// Identity of the preset a roster was generated from, used to detect changes
export function getEnsemblePresetKey(
    activity: string | undefined,
    size: EnsembleSize,
): string {
    return `${activity ?? ""}|${size}`;
}
