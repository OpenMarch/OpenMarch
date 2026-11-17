import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { equipmentCatalog, whoHasValue } from "@openmarch/core";
import { db } from "@/global/database/db";
import {
    editCues,
    deleteCues,
    updateCues,
    type DatabaseCue,
} from "@/db-functions/cues";
import { cueKeys } from "@/hooks/queries/useCues";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { isPerformer } from "@/global/classes/Marcher";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { setLaneShown, type TimelineLaneId } from "@/timeline/timelineLanes";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import { conToastError } from "@/utilities/utils";
import { useShowCues, type EditorCues } from "./useShowCues";
import { useCueSelectionStore } from "./cueSelectionStore";
import {
    describePerformers,
    type LabelHolders,
    type LabelWords,
} from "./cueLabel";
import {
    editedPerformers,
    equipmentCuesOn,
    equipmentValueOfChoice,
    heldValueAt,
    planEquipmentSet,
    equipmentSetIsEmpty,
    withRecent,
    type EquipmentChoice,
} from "./equipment";
import { itemKeyOf } from "./equipmentItems";

/**
 * The beat a cue made at the paused playhead sits on: the beat whose click is the playhead. Spec
 * beat 0 (home) and 1 are both show time 0, so home is the first count; past the last beat there
 * is none.
 */
export function playheadCueBeat<B extends { id: number }>(
    beats: readonly B[],
    playheadBeat: number,
): B | null {
    const index = Math.max(1, Math.round(playheadBeat));
    return beats[index] ?? null;
}

/** Shows lane `id` when the user had hidden it (saved with the UI settings). */
function revealLane(id: TimelineLaneId) {
    const { uiSettings } = useUiSettingsStore.getState();
    if (uiSettings.timelineLanes[id] === false) setLaneShown(id, true);
}

/** Remembers `choice` among the field menu's recent items (saved with the UI settings). */
function rememberChoice(choice: EquipmentChoice) {
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    const recent = withRecent(uiSettings.recentEquipment, choice);
    if (recent.join() !== uiSettings.recentEquipment.join())
        setUiSettings({ ...uiSettings, recentEquipment: recent });
}

export interface CueCommands {
    readonly show: EditorCues | null;
    /** The selected performers' ids, items left out. */
    readonly selectedIds: readonly number[];
    /** The beat a cue made now sits on, or null (no beats, or past the end). */
    readonly beatId: number | null;
    /** The compile's count at the playhead, or null. */
    readonly count: number | null;
    /** Whether every selected performer already holds what `choice` gives them. */
    readonly holdsAlready: (choice: EquipmentChoice) => boolean;
    /** Whether `choice` can be set now: a selection, and a count at the playhead. */
    readonly canSet: (choice: EquipmentChoice) => boolean;
    /** Sets `choice` for the selection at the playhead, as one undo step, and remembers it. */
    readonly setEquipment: (choice: EquipmentChoice) => void;
    /** Who holds any of the Equipment `values` at the playhead. */
    readonly holders: (values: readonly string[]) => readonly number[];
    /** Selects who holds any of the Equipment `values` at the playhead, whatever their section. */
    readonly selectHolding: (values: readonly string[]) => void;
    /** The cue the cue commands act on (`useCueSelectionStore`), or null. */
    readonly cue: DatabaseCue | null;
    /** The cue's performers after adding or removing the selection; null when nothing changes. */
    readonly edited: (edit: "add" | "remove") => number[] | null;
    /**
     * Adds or removes the selection, as one undo step, and names the cue for its new performers;
     * removing everyone deletes the cue.
     */
    readonly editPerformers: (edit: "add" | "remove") => void;
    /** Makes the cue lasting (null) or momentary for `length` counts. */
    readonly setLength: (length: number | null) => void;
    /** Moves the cue to the playhead's count, as one undo step. */
    readonly moveToPlayhead: () => void;
    readonly deleteCue: () => void;
}

/** Moves cue `cueId` to `beatId` and, when given, sets its length: one undo step (lane drags). */
export function writeCueDrag(
    cueId: number,
    change: { beatId?: number; length?: number },
    onError: (error: unknown) => void,
): Promise<void> {
    return updateCues({ db, modifiedCues: [{ id: cueId, ...change }] }).then(
        () => undefined,
        onError,
    );
}

/**
 * The Equipment cue commands (ADR 0015 D-3, D-4, D-6; fork #992), for the action handlers, the
 * field menu and the Equipment lane: set what the selection holds from the paused playhead, select
 * who holds something there, and edit the picked cue. Every write is one undo step.
 */
export function useCueCommands(): CueCommands {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const show = useShowCues();
    const selected = useSelectedMarchers()?.selectedMarchers;
    const beats = useTimingObjects()?.beats;
    const playheadBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    const pickedId = useCueSelectionStore((s) => s.cueId);
    const marchers = useMemo(
        () => (selected ?? []).filter(isPerformer),
        [selected],
    );
    const idsKey = marchers.map((m) => m.id).join(",");

    return useMemo((): CueCommands => {
        const selectedIds = idsKey === "" ? [] : idsKey.split(",").map(Number);
        const beat = beats ? playheadCueBeat(beats, playheadBeat) : null;
        const count =
            beat && show ? (show.countOfBeat.get(beat.id) ?? null) : null;
        const holders = (values: readonly string[]): readonly number[] =>
            show && count !== null
                ? [
                      ...new Set(
                          values.flatMap((v) =>
                              whoHasValue(show.compiled, "equipment", v, count),
                          ),
                      ),
                  ]
                : [];
        const heldBy = (id: number) =>
            show && count !== null
                ? heldValueAt(show.compiled, id, count)
                : undefined;
        const words: LabelWords = {
            performers: (n) => t("cues.label.performers", { count: n }),
        };
        // Everyone holding one catalog item at the playhead, by its plural name ("Rifles")
        const labelHolders = (): LabelHolders[] =>
            equipmentCatalog().map((item) => ({
                name: t(`cues.plural.${itemKeyOf(item.id)}`),
                ids: holders([item.id]),
            }));
        const refresh = () =>
            queryClient.invalidateQueries({ queryKey: cueKeys.all() });
        const fail = (key: string) => (error: unknown) =>
            conToastError(t(key), error);

        const onBeat = show && beat ? equipmentCuesOn(show.cues, beat.id) : [];
        const picked =
            pickedId !== null
                ? (show?.cues.find((c) => c.id === pickedId) ?? null)
                : null;
        const cue = picked ?? (onBeat.length === 1 ? onBeat[0] : null);
        const edited = (edit: "add" | "remove") =>
            cue ? editedPerformers(cue, selectedIds, edit) : null;
        const holdsAlready = (choice: EquipmentChoice) =>
            selectedIds.length > 0 &&
            selectedIds.every((id) => {
                const held = heldBy(id);
                return choice === "usual"
                    ? held === show?.usualValue.get(id)
                    : held === equipmentValueOfChoice(choice);
            });

        return {
            show,
            selectedIds,
            beatId: beat?.id ?? null,
            count,
            holdsAlready,
            canSet: () =>
                beat !== null && count !== null && selectedIds.length > 0,
            setEquipment: (choice) => {
                if (!beat || !show) return;
                // Setting replaces: the selection leaves the beat's other cues and joins the
                // cue of that value, or a new one is made, in one undo step (#992)
                const plan = planEquipmentSet({
                    cues: show.cues,
                    choice,
                    marcherIds: selectedIds,
                    beatId: beat.id,
                    labelFor: (ids) =>
                        describePerformers({
                            ids,
                            marchers: show.marchers,
                            words,
                            holders: labelHolders(),
                        }),
                    relabelFor: (ids) =>
                        describePerformers({
                            ids,
                            marchers: show.marchers,
                            words,
                        }),
                });
                if (equipmentSetIsEmpty(plan)) return;
                rememberChoice(choice);
                // A first Equipment cue makes its lane appear, even one hidden before (#992)
                if (!show.cues.some((c) => c.type === "equipment"))
                    revealLane("equipment");
                void editCues({
                    db,
                    cueIds: new Set(plan.deletedCueIds),
                    modifiedCues: plan.modifiedCues,
                    newCues: plan.newCues,
                })
                    .then(refresh)
                    .catch(fail("cues.errors.create"));
            },
            holders,
            selectHolding: (values) => {
                activeFieldEditor()?.select(holders(values));
            },
            cue,
            edited,
            editPerformers: (edit) => {
                const next = edited(edit);
                if (!cue || !next) return;
                const write =
                    next.length === 0
                        ? deleteCues({ db, cueIds: new Set([cue.id]) })
                        : updateCues({
                              db,
                              modifiedCues: [
                                  {
                                      id: cue.id,
                                      marcherIds: next,
                                      // The old label named who was picked then
                                      label: show
                                          ? describePerformers({
                                                ids: next,
                                                marchers: show.marchers,
                                                words,
                                            })
                                          : cue.label,
                                  },
                              ],
                          });
                void write.then(refresh).catch(fail("cues.errors.update"));
            },
            setLength: (length) => {
                if (!cue || cue.length === length) return;
                void updateCues({ db, modifiedCues: [{ id: cue.id, length }] })
                    .then(refresh)
                    .catch(fail("cues.errors.update"));
            },
            moveToPlayhead: () => {
                if (!cue || !beat || cue.beatId === beat.id) return;
                void updateCues({
                    db,
                    modifiedCues: [{ id: cue.id, beatId: beat.id }],
                })
                    .then(refresh)
                    .catch(fail("cues.errors.update"));
            },
            deleteCue: () => {
                if (!cue) return;
                useCueSelectionStore.getState().pick(null);
                void deleteCues({ db, cueIds: new Set([cue.id]) })
                    .then(refresh)
                    .catch(fail("cues.errors.delete"));
            },
        };
    }, [show, idsKey, beats, playheadBeat, pickedId, queryClient, t]);
}
