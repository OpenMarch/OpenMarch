import type {
    MarcherIdsByTagId,
    SectionAppearance,
    TagAppearance,
    TagAppearanceIdsByPageId,
} from "@/db-functions";
import {
    appearanceIsHidden,
    resolveAppearanceFromStack,
    type AppearanceComponentOptional,
    type ResolvedPerformerAppearance,
} from "@/entity-components/appearance";
import type Marcher from "@/global/classes/Marcher";
import { _combineMarcherAppearances } from "@/hooks/queries/useMarcherAppearances";
import type { FieldProperties } from "@openmarch/core";
import { pageFlags, type FlagPage } from "@/timeline/timelinePlayhead";

/**
 * Marcher appearance in timeline mode, as a step function of the flag beat (docs/timeline/ui.md
 * UI-9 No selected page; ported from P8.12 and `coordinates-v2`'s `dbToMarcherAppearanceTimeline`).
 *
 * Appearance stays per page (`tag_appearances.start_page_id`, section appearances, the field
 * theme). Each page's appearance takes effect at the page's flag, where marchers arrive, and holds
 * until the next flag whose appearance differs. Between two flags the field shows the appearance of
 * the **last flag crossed**, playing or paused (project owner, 2026-10-06), as page-mode playback
 * and the video export do.
 *
 * Steps are keyed by flag beat, not by time, so a tempo edit doesn't change them.
 */

/** One marcher's appearance over the show. */
export interface MarcherAppearanceSteps {
    /** Ascending flag beats at which the appearance changes; the first is the first flag (home) */
    readonly beats: readonly number[];
    /**
     * The appearance stack (`CanvasMarcher.setAppearance`, highest priority first) in effect from
     * the same index's beat until the next one. Before the first beat, the first applies.
     */
    readonly stacks: readonly AppearanceComponentOptional[][];
}

/** Every marcher's appearance steps, by marcher id. */
export type AppearanceStepsByMarcherId = ReadonlyMap<
    number,
    MarcherAppearanceSteps
>;

/** A page's flag: the page and the beat it ends on (`pageFlags`). Home's flag is beat 0. */
export interface AppearanceFlag {
    readonly pageId: number;
    readonly flag: number;
}

/**
 * Every page's flag (`pageFlags`) as a string key, `"pageId:flag,..."`. It changes only when a page
 * or a flag does, not on a tempo edit, so steps built from it aren't rebuilt for one.
 */
export function appearanceFlagsKey(pages: readonly FlagPage[]): string {
    return pageFlags(pages)
        .map((f) => `${f.page.id}:${f.flag}`)
        .join(",");
}

/** The flags in an `appearanceFlagsKey`. */
export function parseAppearanceFlagsKey(key: string): AppearanceFlag[] {
    if (key === "") return [];
    return key.split(",").map((entry) => {
        const [pageId, flag] = entry.split(":");
        return { pageId: Number(pageId), flag: Number(flag) };
    });
}

/**
 * Two flags a hair apart in floating point are the same flag: the live playback beat
 * (`playbackBeat`) can land just short of an integer flag.
 */
const FLAG_EPSILON = 1e-6;

type ResolvedForCompare = ResolvedPerformerAppearance & {
    readonly equipmentName: string | null;
    readonly equipmentState: string | null;
};

const firstValue = <K extends keyof AppearanceComponentOptional>(
    stack: readonly AppearanceComponentOptional[],
    key: K,
): AppearanceComponentOptional[K] | null => {
    for (const appearance of stack)
        if (appearance[key] != null) return appearance[key];
    return null;
};

const resolveForCompare = (
    stack: AppearanceComponentOptional[],
    fieldProperties: FieldProperties,
): ResolvedForCompare => ({
    ...resolveAppearanceFromStack(stack, fieldProperties.theme),
    equipmentName:
        (firstValue(stack, "equipment_name") as string | null) ?? null,
    equipmentState:
        (firstValue(stack, "equipment_state") as string | null) ?? null,
});

const sameAppearance = (a: ResolvedForCompare, b: ResolvedForCompare) =>
    a.fillRgba === b.fillRgba &&
    a.strokeRgba === b.strokeRgba &&
    a.strokeWidth === b.strokeWidth &&
    a.visible === b.visible &&
    a.textVisible === b.textVisible &&
    a.shape === b.shape &&
    a.equipmentName === b.equipmentName &&
    a.equipmentState === b.equipmentState;

/**
 * Builds every marcher's appearance steps from the page-keyed rows.
 *
 * Each page's stack is the one the canvas used for that page before: the tag appearances in effect
 * on the page (by priority), then the section appearance, then the field theme
 * (`_combineMarcherAppearances`). The per-marcher-page overrides of `marcher_pages` are left out,
 * as everywhere in timeline mode (P7.14). A page whose appearance resolves the same as the one
 * before adds no step.
 *
 * A page missing from `tagAppearanceIdsByPageId` (a page added since the map was read) keeps the
 * tag appearances of the page before it, as the map would: a new page starts no tag appearance.
 *
 * @param flags every page's flag, in show order (`pageFlags`)
 */
export function buildAppearanceSteps({
    flags,
    marchers,
    sectionAppearances,
    marcherIdsByTagId,
    tagAppearances,
    tagAppearanceIdsByPageId,
    fieldProperties,
}: {
    flags: readonly AppearanceFlag[];
    marchers: readonly Marcher[];
    sectionAppearances: SectionAppearance[];
    marcherIdsByTagId: MarcherIdsByTagId;
    tagAppearances: readonly TagAppearance[];
    tagAppearanceIdsByPageId: TagAppearanceIdsByPageId;
    fieldProperties: FieldProperties;
}): Map<number, MarcherAppearanceSteps> {
    const beats = new Map<number, number[]>();
    const stacks = new Map<number, AppearanceComponentOptional[][]>();
    const last = new Map<number, ResolvedForCompare>();
    for (const marcher of marchers) {
        beats.set(marcher.id, []);
        stacks.set(marcher.id, []);
    }
    let previousIds: ReadonlySet<number> = new Set();
    for (const { pageId, flag } of flags) {
        const ids = tagAppearanceIdsByPageId.get(pageId) ?? previousIds;
        previousIds = ids;
        const byMarcher = _combineMarcherAppearances({
            marchers: marchers as Marcher[],
            sectionAppearances,
            marcherIdsByTagId,
            tagAppearances: tagAppearances.filter((a) => ids.has(a.id)),
            marcherPages: {},
            fieldProperties,
        });
        for (const marcher of marchers) {
            const stack = byMarcher[marcher.id];
            if (!stack) continue;
            const marcherBeats = beats.get(marcher.id)!;
            const marcherStacks = stacks.get(marcher.id)!;
            // Two pages on one flag (a page with no beats): the later one wins
            if (
                marcherBeats.length > 0 &&
                Math.abs(marcherBeats[marcherBeats.length - 1]! - flag) <
                    FLAG_EPSILON
            ) {
                marcherBeats.pop();
                marcherStacks.pop();
                last.delete(marcher.id);
                const before = marcherStacks[marcherStacks.length - 1];
                if (before)
                    last.set(
                        marcher.id,
                        resolveForCompare(before, fieldProperties),
                    );
            }
            const resolved = resolveForCompare(stack, fieldProperties);
            const previous = last.get(marcher.id);
            if (previous && sameAppearance(previous, resolved)) continue;
            last.set(marcher.id, resolved);
            marcherBeats.push(flag);
            marcherStacks.push(stack);
        }
    }
    const out = new Map<number, MarcherAppearanceSteps>();
    for (const marcher of marchers)
        out.set(marcher.id, {
            beats: beats.get(marcher.id)!,
            stacks: stacks.get(marcher.id)!,
        });
    return out;
}

/**
 * The appearance stack in effect at `beat`: the one at the last flag at or before it (the last
 * flag crossed), or the first before the first flag. A binary search, cheap enough for every
 * marcher on every frame. `null` for empty steps.
 *
 * The returned array is the one stored in the steps, so callers can skip re-applying an unchanged
 * appearance by comparing references.
 */
export function appearanceStackAtBeat(
    steps: MarcherAppearanceSteps,
    beat: number,
): AppearanceComponentOptional[] | null {
    const { beats, stacks } = steps;
    if (stacks.length === 0) return null;
    const b = beat + FLAG_EPSILON;
    let lo = 0;
    let hi = beats.length - 1;
    let found = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid]! <= b) {
            found = mid;
            lo = mid + 1;
        } else hi = mid - 1;
    }
    return stacks[found]!;
}

/**
 * Every beat at which any marcher's appearance changes, ascending and without repeats. Between two
 * of them nobody's appearance changes, so a reader can follow the appearance by the index of the
 * last one at or before a beat (`changeIndexAtBeat`) instead of by every beat.
 */
export function appearanceChangeBeats(
    steps: AppearanceStepsByMarcherId,
): number[] {
    const all = new Set<number>();
    for (const marcherSteps of steps.values())
        for (const beat of marcherSteps.beats) all.add(beat);
    return [...all].sort((a, b) => a - b);
}

/**
 * How many of `changeBeats` are at or before `beat` (with the same float tolerance as
 * `appearanceStackAtBeat`): it changes only when the appearance of someone can.
 */
export function changeIndexAtBeat(
    changeBeats: readonly number[],
    beat: number,
): number {
    const b = beat + FLAG_EPSILON;
    let lo = 0;
    let hi = changeBeats.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (changeBeats[mid]! <= b) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/** The marchers whose appearance at `beat` is hidden, so they can't be selected. */
export function hiddenMarcherIdsAtBeat(
    steps: AppearanceStepsByMarcherId,
    beat: number,
): Set<number> {
    const hidden = new Set<number>();
    for (const [marcherId, marcherSteps] of steps) {
        const stack = appearanceStackAtBeat(marcherSteps, beat);
        if (stack && appearanceIsHidden(stack)) hidden.add(marcherId);
    }
    return hidden;
}
