/**
 * The show's cues compiled in the editor (ADR 0015), with the same Equipment defaults the 3D View
 * uses: each section's usual equipment (`sectionCueCarry`, `cueSectionsOf`). The 2D field's
 * equipment tags, "Select Rifles" and the Equipment lane all read this one compile, so they agree
 * with each other and with the 3D View on who holds what.
 *
 * Counts are the compile's: count `c` is the c-th beat with a duration, and the number `c` is its
 * click. Pure: no React or database.
 */
import {
    compileCues,
    type CompiledCues,
    type CueInput,
    type PerformerCarry,
} from "@openmarch/core";
import { sectionCueCarry } from "@/view3d/core/marchers/hornChannel";
import { carryForSection } from "@/view3d/core/instruments/catalog";
import { cueSectionsOf } from "@/view3d/window/performers/cueSections";

/** What the compile reads of a performer. */
export interface ShowCueMarcher {
    readonly id: number;
    readonly section: string;
}

/** What the compile reads of a beat. */
export interface ShowCueBeat {
    readonly id: number;
    readonly position: number;
    readonly duration: number;
}

export interface ShowCues {
    readonly compiled: CompiledCues;
    /** The compile's counts, in order: count `c` is `beatIds[c]`. */
    readonly beatIds: readonly number[];
    /** Each timed beat's count. */
    readonly countOfBeat: ReadonlyMap<number, number>;
    /** Each performer's section's usual equipment, as the compile groups it. */
    readonly usual: ReadonlyMap<number, PerformerCarry>;
}

/** What a performer of `section` usually holds: the section's instrument, flag or rifle. */
export const usualCarryOf = (section: string): PerformerCarry =>
    sectionCueCarry(section);

/** Compiles the stored cues over the performers and timed beats. */
export function compileShowCues(
    marchers: readonly ShowCueMarcher[],
    beats: readonly ShowCueBeat[],
    cues: readonly CueInput[],
): ShowCues {
    const timed = beats
        .filter((b) => b.duration > 0)
        .sort((a, b) => a.position - b.position);
    const usual = new Map(marchers.map((m) => [m.id, usualCarryOf(m.section)]));
    const compiled = compileCues({
        beats: timed.map((b) => ({ id: b.id, duration: b.duration })),
        marchers: marchers.map((m) => ({
            id: m.id,
            section: m.section,
            carries: usual.get(m.id)!,
        })),
        cues,
        sections: cueSectionsOf(
            marchers.map((m) => ({
                section: m.section,
                family: carryForSection(m.section)?.family ?? null,
            })),
        ),
    });
    return {
        compiled,
        beatIds: timed.map((b) => b.id),
        countOfBeat: new Map(timed.map((b, c) => [b.id, c])),
        usual,
    };
}
