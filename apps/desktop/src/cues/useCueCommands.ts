import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { whoHolds, type PerformerCarry } from "@openmarch/core";
import { db } from "@/global/database/db";
import {
    createCues,
    deleteCues,
    updateCues,
    type DatabaseCue,
} from "@/db-functions/cues";
import { cueKeys } from "@/hooks/queries/useCues";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { isPerformer } from "@/global/classes/Marcher";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import { conToastError } from "@/utilities/utils";
import { useShowCues, type EditorCues } from "./useShowCues";
import { useCueSelectionStore } from "./cueSelectionStore";
import { describePerformers, type LabelWords } from "./cueLabel";
import {
    carryForChoice,
    editedPerformers,
    equipmentCuesOn,
    planEquipmentCues,
    type EquipmentChoice,
} from "./equipment";

const HOLDING: readonly PerformerCarry[] = [
    "winds",
    "battery",
    "flag",
    "rifle",
    "sabre",
    "none",
];

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

export interface CueCommands {
    readonly show: EditorCues | null;
    /** The selected performers' ids, items left out. */
    readonly selectedIds: readonly number[];
    /** The beat a cue made now sits on, or null (no beats, or past the end). */
    readonly beatId: number | null;
    /** The compile's count at the playhead, or null. */
    readonly count: number | null;
    /** What every selected performer holds at the playhead, when they all hold the same. */
    readonly selectionHolds: PerformerCarry | null;
    /** Whether `choice` reaches any selected performer. */
    readonly canSet: (choice: EquipmentChoice) => boolean;
    /** Sets `choice` for the selection at the playhead, as one undo step. */
    readonly setEquipment: (choice: EquipmentChoice) => void;
    /** Who holds `carry` at the playhead. */
    readonly holders: (carry: PerformerCarry) => readonly number[];
    /** Selects who holds any of `carries` at the playhead, whatever their section. */
    readonly selectHolding: (...carries: PerformerCarry[]) => void;
    /** The cue the cue commands act on (`useCueSelectionStore`), or null. */
    readonly cue: DatabaseCue | null;
    /** The cue's performers after adding or removing the selection; null when nothing changes. */
    readonly edited: (edit: "add" | "remove") => number[] | null;
    /** Adds or removes the selection, as one undo step; removing everyone deletes the cue. */
    readonly editPerformers: (edit: "add" | "remove") => void;
    /** Makes the cue lasting (null) or momentary for `length` counts. */
    readonly setLength: (length: number | null) => void;
    readonly deleteCue: () => void;
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
        const holders = (carry: PerformerCarry): readonly number[] =>
            show && count !== null ? whoHolds(show.compiled, carry, count) : [];
        const holdsOf = new Map(HOLDING.map((c) => [c, holders(c)]));
        const heldBy = (id: number) =>
            HOLDING.find((c) => holdsOf.get(c)!.includes(id)) ?? null;
        const held = new Set(selectedIds.map(heldBy));
        const selectionHolds = held.size === 1 ? ([...held][0] ?? null) : null;
        const usualOf = (id: number) => show?.usual.get(id) ?? "none";
        const words: LabelWords = {
            holding: (carry) => t(`cues.label.holding.${carry}`),
            performers: (n) => t("cues.label.performers", { count: n }),
        };
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

        return {
            show,
            selectedIds,
            beatId: beat?.id ?? null,
            count,
            selectionHolds,
            canSet: (choice) =>
                beat !== null &&
                count !== null &&
                selectedIds.some(
                    (id) => carryForChoice(choice, usualOf(id)) !== null,
                ),
            setEquipment: (choice) => {
                if (!beat || !show) return;
                const label = describePerformers({
                    ids: selectedIds,
                    marchers: show.marchers,
                    words,
                    holders: holdsOf,
                });
                const newCues = planEquipmentCues({
                    choice,
                    marcherIds: selectedIds,
                    beatId: beat.id,
                    usualOf,
                    label,
                });
                if (newCues.length === 0) return;
                void createCues({ db, newCues })
                    .then(refresh)
                    .catch(fail("cues.errors.create"));
            },
            holders,
            selectHolding: (...carries) => {
                const ids = carries.flatMap((c) => holdsOf.get(c) ?? []);
                activeFieldEditor()?.select(ids);
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
                              modifiedCues: [{ id: cue.id, marcherIds: next }],
                          });
                void write.then(refresh).catch(fail("cues.errors.update"));
            },
            setLength: (length) => {
                if (!cue || cue.length === length) return;
                void updateCues({ db, modifiedCues: [{ id: cue.id, length }] })
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
