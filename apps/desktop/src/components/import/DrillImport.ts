import { FieldProperties } from "@openmarch/core";
import { useMutation } from "@tanstack/react-query";
import { parseDrillPackage, type DrillShow } from "@openmarch/drill-interop";
import {
    FIRST_BEAT_ID,
    FIRST_PAGE_ID,
    transactionWithHistory,
    createBeatsInTransaction,
    createMarchersInTransaction,
    createPagesInTransaction,
    deleteBeatsInTransaction,
    deleteMarchersInTransaction,
    deleteMeasuresInTransaction,
    deletePagesInTransaction,
    updateMarcherPagesInTransaction,
    updateUtilityInTransaction,
    type ModifiedMarcherPageArgs,
    type NewBeatArgs,
    type NewMarcherArgs,
    type NewPageArgs,
} from "@/db-functions";
import { db } from "@/global/database/db";
import { queryClient } from "@/App";
import { conToastError } from "@/utilities/utils";
import { useTimingObjects } from "@/hooks";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { coordinateDataKeys } from "@/hooks/queries/useCoordinateData";
import { marcherPageKeys } from "@/hooks/queries/useMarcherPages";
import { marcherKeys } from "@/hooks/queries/useMarchers";
import { marcherWithVisualsKeys } from "@/hooks/queries/useMarchersWithVisuals";
import { fieldGeometry, sourcePointToPixels } from "./drillTransform";
import { resolveSectionForDrillPrefix } from "@/global/drillLabel";

export type DrillImportResult = {
    success: boolean;
    message: string;
    marchers: number;
    sets: number;
};

/** A neutral, default 120bpm beat; musical timing can be imported separately. */
const DEFAULT_BEAT_DURATION_SECONDS = 0.5;

/**
 * Replaces the current show's marchers, pages, and coordinates with those from a
 * parsed drill package, all within a single undoable transaction.
 */
// eslint-disable-next-line max-lines-per-function
export const _importDrillShow = async (
    show: DrillShow,
): Promise<Omit<DrillImportResult, "message" | "success">> => {
    return await transactionWithHistory(
        db,
        "importDrillShow",
        // eslint-disable-next-line max-lines-per-function
        async (tx) => {
            const fieldRow = await tx.query.field_properties.findFirst();
            if (!fieldRow) throw new Error("Field properties not found");
            const geometry = fieldGeometry(
                new FieldProperties(JSON.parse(fieldRow.json_data)),
            );

            // Clear the existing show. The first beat and first page are permanent
            // anchors and are reused for the drill's opening set.
            const existingMarchers = await tx.query.marchers.findMany();
            if (existingMarchers.length > 0) {
                await deleteMarchersInTransaction({
                    tx,
                    marcherIds: new Set(existingMarchers.map((m) => m.id)),
                });
            }
            const existingPages = await tx.query.pages.findMany();
            await deletePagesInTransaction({
                tx,
                pageIds: new Set(existingPages.map((p) => p.id)),
            });
            // Measures reference beats via start_beat, so they must go before the
            // beats they point at.
            const existingMeasures = await tx.query.measures.findMany();
            if (existingMeasures.length > 0) {
                await deleteMeasuresInTransaction({
                    tx,
                    itemIds: new Set(existingMeasures.map((m) => m.id)),
                });
            }
            const existingBeats = await tx.query.beats.findMany();
            await deleteBeatsInTransaction({
                tx,
                beatIds: new Set(
                    existingBeats
                        .filter((b) => b.id !== FIRST_BEAT_ID)
                        .map((b) => b.id),
                ),
            });

            // One beat per count for the full show length. The first beat (position
            // 0) already exists, so we add the remaining counts after it.
            const newBeats: NewBeatArgs[] = Array.from(
                { length: Math.max(0, show.totalCounts - 1) },
                () => ({
                    duration: DEFAULT_BEAT_DURATION_SECONDS,
                    include_in_measure: true,
                }),
            );
            const createdBeats =
                newBeats.length > 0
                    ? await createBeatsInTransaction({
                          tx,
                          newBeats,
                          startingPosition: 0,
                      })
                    : [];
            const beatIdAtCount = (count: number): number =>
                count <= 0 ? FIRST_BEAT_ID : createdBeats[count - 1]!.id;

            // Create pages before marchers so createMarchersInTransaction seeds a
            // marcher_page row for every page in one pass.
            const [, ...laterSets] = show.sets;
            const newPages: NewPageArgs[] = laterSets.map((set) => ({
                start_beat: beatIdAtCount(set.startCount),
                is_subset: false,
                notes: set.notes ?? null,
            }));
            const createdPages =
                newPages.length > 0
                    ? await createPagesInTransaction({ tx, newPages })
                    : [];
            const pageIdForSet = (index: number): number =>
                index === 0 ? FIRST_PAGE_ID : createdPages[index - 1]!.id;

            const allPerformers = [
                ...show.performers,
                ...show.props,
                ...show.supplemental,
            ];
            const newMarchers: NewMarcherArgs[] = allPerformers.map((p) => ({
                section: resolveSectionForDrillPrefix(p.drill_prefix),
                drill_prefix: p.drill_prefix,
                drill_order: p.drill_order,
            }));
            const createdMarchers = await createMarchersInTransaction({
                tx,
                newMarchers,
            });
            const marcherIdByPerformer = new Map<string, number>();
            allPerformers.forEach((p, i) =>
                marcherIdByPerformer.set(p.id, createdMarchers[i]!.id),
            );

            // Write real coordinates for every performer at every set.
            const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [];
            show.sets.forEach((set, index) => {
                const page_id = pageIdForSet(index);
                for (const [performerId, point] of Object.entries(
                    set.coordinates,
                )) {
                    const marcher_id = marcherIdByPerformer.get(performerId);
                    if (marcher_id === undefined) continue;
                    const { x, y } = sourcePointToPixels(
                        point,
                        show.field,
                        geometry,
                    );
                    modifiedMarcherPages.push({ marcher_id, page_id, x, y });
                }
            });
            await updateMarcherPagesInTransaction({ tx, modifiedMarcherPages });

            // Hold the final formation for the remainder of the show.
            const lastSet = show.sets.at(-1);
            if (lastSet) {
                await updateUtilityInTransaction({
                    tx,
                    args: {
                        last_page_counts: Math.max(
                            1,
                            show.totalCounts - lastSet.startCount,
                        ),
                    },
                });
            }

            return {
                marchers: createdMarchers.length,
                sets: show.sets.length,
            };
        },
    );
};

/** Imports embedded show audio (if any) via the main process, selecting it. */
async function importDrillAudio(show: DrillShow): Promise<void> {
    if (!show.audio) return;
    const { data, name } = show.audio;
    const arrayBuffer = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    await window.electron.insertAudioFileFromBuffer({
        data: arrayBuffer,
        nickname: name,
    });
}

/**
 * Parses a drill interchange package (`.3dz`) and imports it into the current
 * show: marchers, sets/pages, coordinates, and embedded audio.
 */
export const importDrillPackage = async (
    file: File,
): Promise<DrillImportResult> => {
    const show = await parseDrillPackage(await file.arrayBuffer());
    const { marchers, sets } = await _importDrillShow(show);
    await importDrillAudio(show);
    return {
        success: true,
        message: show.title
            ? `Imported "${show.title}"`
            : "Imported drill file",
        marchers,
        sets,
    };
};

/** React Query mutation that imports a drill package and refreshes all data. */
export const useImportDrillPackage = () => {
    const { fetchTimingObjects } = useTimingObjects();
    const { setPageToSelect } = useSelectedPage() ?? {};
    return useMutation({
        mutationFn: (file: File) => importDrillPackage(file),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: marcherKeys.all() }),
                queryClient.invalidateQueries({
                    queryKey: marcherPageKeys.all(),
                }),
                queryClient.invalidateQueries({
                    queryKey: marcherWithVisualsKeys.all(),
                }),
                queryClient.invalidateQueries({
                    queryKey: coordinateDataKeys.all,
                }),
            ]);
            await fetchTimingObjects();
            // Page ids are recreated during import; re-select the first set.
            setPageToSelect?.({ id: FIRST_PAGE_ID });
        },
        onError: (error) => {
            conToastError("Failed to import drill file", error);
        },
    });
};
