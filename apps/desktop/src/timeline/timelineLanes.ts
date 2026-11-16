/**
 * The timeline's lanes (ADR 0015 D-7; fork #992): the rows under the page row and the count
 * ruler that can be shown or hidden. Moves (the move tracks) shows by default; the cue lanes
 * (Equipment now; Facing, Position, Look and the rest join as they're built) are hidden by default.
 * The page row and the ruler are the time ruler and always show, so they aren't lanes.
 *
 * Each lane has its own show/hide action, so the Lanes menu, the app's View menu, a lane's eye
 * button and the command bar all run the same command, and a shortcut can be bound to it. Whether
 * each lane shows is saved per device with the UI settings. Hiding Moves only hides the tracks:
 * the drill doesn't change, and the field shows and edits it as before.
 */
import type { ActionId } from "@/shortcuts/definitions";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";

export type TimelineLaneId = "moves" | "equipment";

export interface TimelineLaneDefinition {
    readonly id: TimelineLaneId;
    /** The lane's name, in the Lanes menu and its own heading */
    readonly labelKey: string;
    /** Shows or hides it */
    readonly toggleAction: ActionId;
    /** Whether it shows before anyone chose */
    readonly shownByDefault: boolean;
}

/** The lanes, in the order the menu lists them and the timeline draws them. */
export const TIMELINE_LANES: readonly TimelineLaneDefinition[] = [
    {
        id: "moves",
        labelKey: "timeline.lanes.moves",
        toggleAction: "toggleMovesLane",
        shownByDefault: true,
    },
    {
        id: "equipment",
        labelKey: "cues.lane.equipment",
        toggleAction: "toggleEquipmentLane",
        shownByDefault: false,
    },
];

const DEFAULTS = new Map(TIMELINE_LANES.map((l) => [l.id, l.shownByDefault]));

/** Whether `id` shows, given the saved choices. */
export const laneShown = (
    saved: Readonly<Record<string, boolean>>,
    id: TimelineLaneId,
): boolean => saved[id] ?? DEFAULTS.get(id) ?? false;

/** Whether the timeline shows lane `id`. */
export const useLaneShown = (id: TimelineLaneId): boolean =>
    useUiSettingsStore((s) => laneShown(s.uiSettings.timelineLanes, id));

/** Shows or hides lane `id` (saved with the UI settings, per device). */
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
