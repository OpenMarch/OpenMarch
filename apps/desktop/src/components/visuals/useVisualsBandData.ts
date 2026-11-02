/**
 * Everything Visuals mode's cue band draws for the focused who on the
 * current tab, from the show's stored cues and a compile of them: the lanes
 * (`visualsLanes.ts`), the result row, the counts and what each focused
 * marcher carries. Null with no focus, or while the show loads.
 */
import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import tolgee from "@/global/singletons/Tolgee";
import {
    compileCues,
    type CompiledCues,
    type CueFlagKind,
    type CueTarget,
    type PerformerCarry,
} from "@openmarch/core";
import { allCuesQueryOptions } from "@/hooks/queries/useCues";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import { marcherIdsForAllTagIdsQueryOptions } from "@/hooks/queries/tags/queries";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import {
    useShowPerformerDefaults,
    useStoredCues,
    type StoredCues,
} from "@/view3d/window/performers/useStoredCues";
import { sectionCueCarry } from "@/view3d/core/marchers/hornChannel";
import { useVisualsStore } from "@/stores/VisualsStore";
import {
    countIndex,
    flagsByCue,
    resultRow,
    targetOfWho,
    visualsLanes,
    type CountIndex,
    type Lanes,
    type ResultSpan,
} from "./visualsLanes";
import type { VisualsChannel, VisualsWho } from "./visualsWho";

const NO_TAGS: ReadonlyMap<number, readonly number[]> = new Map();

export interface VisualsBandData {
    channel: VisualsChannel;
    focus: VisualsWho;
    target: CueTarget | null;
    lanes: Lanes;
    result: ResultSpan[];
    counts: CountIndex;
    compiled: CompiledCues;
    /** Each cue's flags that reach a focused marcher (`flagsByCue`). */
    flags: ReadonlyMap<number, readonly CueFlagKind[]>;
    /** What the focused marchers carry, each kind once. */
    carries: PerformerCarry[];
    /** How many marchers are focused. */
    marcherCount: number;
}

/** The show's cues compiled over its counts, as the 3D View compiles them. */
function compileShow(
    beats: readonly { id: number; duration: number }[],
    counts: CountIndex,
    marchers: readonly { id: number; section: string }[],
    stored: StoredCues,
    defaults: { stepOffFoot: "left" | "right" },
): CompiledCues {
    const duration = new Map(beats.map((b) => [b.id, b.duration]));
    return compileCues({
        beats: counts.beatIdOfCount.map((id) => ({
            id,
            duration: duration.get(id)!,
        })),
        marchers: marchers.map((m, i) => ({
            id: m.id,
            section: m.section,
            tagIds: [...(stored.tagIds.get(m.id) ?? [])],
            drillOrder: i,
            carries: sectionCueCarry(m.section),
        })),
        cues: stored.cues,
        phraseAssets: stored.phraseAssets,
        showDefaults: { stepOffFoot: defaults.stepOffFoot },
    });
}

/** `enabled` false (outside Visuals mode) skips the compile and returns null. */
export function useVisualsBandData(enabled = true): VisualsBandData | null {
    const channel = useVisualsStore((s) => s.channel);
    const focus = useVisualsStore((s) => s.focus);
    const focusIds = useVisualsStore((s) => s.focusMarcherIds);
    const { data: cues } = useQuery(allCuesQueryOptions());
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { data: byTag } = useQuery(marcherIdsForAllTagIdsQueryOptions());
    const { beats } = useTimingObjects();
    const stored = useStoredCues();
    const defaults = useShowPerformerDefaults();
    const { selectedMarchers } = useSelectedMarchers()!;
    // Only a focused selection reads it, so clicking marchers with another
    // who focused doesn't redo the lanes and the result row
    const selection = focus?.kind === "selection" ? selectedMarchers : null;

    // Lane and result labels are worded in the app's language (`cueValueText`)
    const language = useSyncExternalStore(subscribeLanguage, currentLanguage);
    const counts = useMemo(() => countIndex(beats), [beats]);
    const compiled = useMemo(
        () =>
            enabled && marchers && stored
                ? compileShow(beats, counts, marchers, stored, defaults)
                : null,
        [enabled, marchers, stored, counts, beats, defaults],
    );

    return useMemo(() => {
        if (!focus || !focusIds || !marchers || !cues || !compiled) return null;
        const target = targetOfWho(
            focus,
            (selection ?? []).map((m) => m.id),
        );
        const lanes = visualsLanes({
            cues,
            channel,
            target,
            focusIds,
            marchers,
            marcherIdsByTagId: byTag ?? NO_TAGS,
            counts,
        });
        const focused = marchers.filter((m) => focusIds.has(m.id));
        const flags = flagsByCue(compiled.flags, focusIds);
        return {
            channel,
            focus,
            target,
            lanes,
            result: resultRow({
                compiled,
                channel,
                focusIds,
                countCount: counts.beatIdOfCount.length,
                lanes,
                flagged: new Set(flags.keys()),
            }),
            counts,
            compiled,
            flags,
            carries: [
                ...new Set(focused.map((m) => sectionCueCarry(m.section))),
            ],
            marcherCount: focused.length,
        };
        // `language` redoes the labels, which `cueValueText` words in the app's language
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        focus,
        focusIds,
        marchers,
        cues,
        compiled,
        selection,
        channel,
        byTag,
        counts,
        language,
    ]);
}

/** The app's language, from the Tolgee singleton, so this works without a provider */
function subscribeLanguage(onChange: () => void): () => void {
    const listener = tolgee.on("language", onChange);
    return () => listener.unsubscribe();
}

function currentLanguage(): string | undefined {
    return tolgee.getLanguage();
}
