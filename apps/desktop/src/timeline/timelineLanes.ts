/**
 * The timeline's lanes (ADR 0015 D-7; fork #992): the rows under the page row and the count
 * ruler. The page row and the ruler are the time ruler and always show, so they aren't lanes.
 *
 * - **In this show:** Moves (in Expert, where moves have bars), each cue lane whose type has a
 *   cue, and each cue lane the user added. Only those appear, and each can be hidden.
 * - **Add a lane:** the other built cue lanes, by family. Adding one shows it empty, ready for
 *   cues. A hidden lane with no cues goes back to this list.
 *
 * A lane's choice (shown or hidden, which adds or hides it) is saved per device with the UI
 * settings (`timelineLanes`). Each lane has its own show/hide action, so the Lanes menu, the lane
 * name menu, the View menu, a lane's eye button and the command bar all run the same command.
 * Hiding Moves only hides the bars (they fold into a strip); the drill doesn't change.
 *
 * New cue lanes join `TIMELINE_LANES` with a family when they're built; the menus list them
 * without other changes.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CueType } from "@openmarch/core";
import type { ActionId } from "@/shortcuts/definitions";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { allCuesQueryOptions } from "@/hooks/queries/useCues";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";

export type TimelineLaneId = "moves" | "equipment";

export interface TimelineLaneDefinition {
    readonly id: TimelineLaneId;
    /** The lane's name, in the menus and its own heading */
    readonly labelKey: string;
    /** Shows or hides it */
    readonly toggleAction: ActionId;
    /** The cue type a cue lane draws; none for Moves */
    readonly cueType?: CueType;
    /** The family "Add a lane" files a cue lane under (ADR 0015 D-3's groups) */
    readonly familyKey?: string;
}

/** The lanes, in the order the menus list them and the timeline draws them. */
export const TIMELINE_LANES: readonly TimelineLaneDefinition[] = [
    {
        id: "moves",
        labelKey: "timeline.lanes.moves",
        toggleAction: "toggleMovesLane",
    },
    {
        id: "equipment",
        labelKey: "cues.lane.equipment",
        toggleAction: "toggleEquipmentLane",
        cueType: "equipment",
        familyKey: "cues.laneFamily.equipment",
    },
];

/** One lane's state in this show. */
export interface LaneState {
    readonly lane: TimelineLaneDefinition;
    /** Listed under "In this show" (and counted when hidden) */
    readonly inShow: boolean;
    /** Drawn on the timeline */
    readonly shown: boolean;
    /** A cue lane's cue count; null for Moves */
    readonly cueCount: number | null;
}

/**
 * Each lane's state from the saved choices (`true` shown or added, `false` hidden), the show's cue
 * count per type, and whether Moves applies (Expert).
 */
export function laneStates({
    saved,
    cueCounts,
    expert,
}: {
    saved: Readonly<Record<string, boolean>>;
    cueCounts: ReadonlyMap<string, number>;
    expert: boolean;
}): LaneState[] {
    return TIMELINE_LANES.map((lane) => {
        const choice = saved[lane.id];
        if (!lane.cueType)
            return {
                lane,
                inShow: expert,
                shown: expert && choice !== false,
                cueCount: null,
            };
        const cueCount = cueCounts.get(lane.cueType) ?? 0;
        const inShow = cueCount > 0 || choice === true;
        return { lane, inShow, shown: inShow && choice !== false, cueCount };
    });
}

/** How many lanes in this show are hidden (Moves too). */
export const hiddenLaneCount = (states: readonly LaneState[]): number =>
    states.filter((s) => s.inShow && !s.shown).length;

/** What the Lanes menu lists for a search. */
export interface LanesMenuModel {
    /** "In this show", in lane order */
    readonly inShow: readonly LaneState[];
    /** "Add a lane", by family in first-seen order; empty families are left out */
    readonly add: readonly {
        readonly familyKey: string;
        readonly lanes: readonly LaneState[];
    }[];
}

/**
 * The Lanes menu's two sections, filtered by `query` (matched against each lane's and family's
 * name, ignoring case). `nameOf` translates a key.
 */
export function lanesMenuModel(
    states: readonly LaneState[],
    query: string,
    nameOf: (key: string) => string,
): LanesMenuModel {
    const q = query.trim().toLowerCase();
    const matches = (s: LaneState) =>
        q === "" ||
        nameOf(s.lane.labelKey).toLowerCase().includes(q) ||
        (s.lane.familyKey !== undefined &&
            nameOf(s.lane.familyKey).toLowerCase().includes(q));
    const inShow = states.filter((s) => s.inShow && matches(s));
    const families = new Map<string, LaneState[]>();
    for (const s of states) {
        if (s.inShow || !s.lane.familyKey || !matches(s)) continue;
        const list = families.get(s.lane.familyKey) ?? [];
        list.push(s);
        families.set(s.lane.familyKey, list);
    }
    return {
        inShow,
        add: [...families].map(([familyKey, lanes]) => ({ familyKey, lanes })),
    };
}

/** Each cue type's cue count in the open show. */
function useCueCounts(): ReadonlyMap<string, number> {
    const ready = useDatabaseReady();
    const { data } = useQuery({ ...allCuesQueryOptions(), enabled: ready });
    return useMemo(() => {
        const counts = new Map<string, number>();
        for (const cue of data ?? [])
            counts.set(cue.type, (counts.get(cue.type) ?? 0) + 1);
        return counts;
    }, [data]);
}

/** Every lane's state in the open show. */
export function useLaneStates(): LaneState[] {
    const saved = useUiSettingsStore((s) => s.uiSettings.timelineLanes);
    const cueCounts = useCueCounts();
    const expert = !useIsBasicMode();
    return useMemo(
        () => laneStates({ saved, cueCounts, expert }),
        [saved, cueCounts, expert],
    );
}

/** Whether the timeline draws lane `id`. */
export const useLaneShown = (id: TimelineLaneId): boolean =>
    useLaneStates().find((s) => s.lane.id === id)?.shown ?? false;

/** Shows (or adds) or hides lane `id` (saved with the UI settings, per device). */
export function setLaneShown(id: TimelineLaneId, shown: boolean): void {
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    setUiSettings({
        ...uiSettings,
        timelineLanes: { ...uiSettings.timelineLanes, [id]: shown },
    });
}

/** Whether lane `id` is folded into its summary row (cue lanes). */
export const useLaneFolded = (id: TimelineLaneId): boolean =>
    useUiSettingsStore((s) => s.uiSettings.timelineFoldedCueLanes.includes(id));

/** Folds or opens lane `id`. */
export function setLaneFolded(id: TimelineLaneId, folded: boolean): void {
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    const list = uiSettings.timelineFoldedCueLanes;
    setUiSettings({
        ...uiSettings,
        timelineFoldedCueLanes: folded
            ? [...new Set([...list, id])]
            : list.filter((t) => t !== id),
    });
}

/** The lane a cue type draws in, if it's built. */
export const laneOfCueType = (
    type: string,
): TimelineLaneDefinition | undefined =>
    TIMELINE_LANES.find((l) => l.cueType === type);
