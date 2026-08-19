import { useMutation } from "@tanstack/react-query";
import {
    beatDurationsFromSyncTimestamps,
    parseDrillPackage,
    type DrillShow,
} from "@openmarch/drill-interop";
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
import {
    getWorkspaceSettingsParsed,
    updateWorkspaceSettingsParsed,
} from "@/db-functions/workspaceSettings";
import { db, schema } from "@/global/database/db";
import { eq } from "drizzle-orm";
import { queryClient } from "@/App";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import { useTimingObjects } from "@/hooks";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { coordinateDataKeys } from "@/hooks/queries/useCoordinateData";
import { marcherPageKeys } from "@/hooks/queries/useMarcherPages";
import { marcherKeys } from "@/hooks/queries/useMarchers";
import { marcherWithVisualsKeys } from "@/hooks/queries/useMarchersWithVisuals";
import { fieldPropertiesKeys } from "@/hooks/queries/useFieldProperties";
import { workspaceSettingsKeys } from "@/hooks/queries/useWorkspaceSettings";
import { lastPageCountsForImport, sourcePointToPixels } from "./drillTransform";
import { resolveDrillField } from "./resolveField";
import { resolveSectionForDrillPrefix } from "@/global/drillLabel";

export type DrillImportResult = {
    success: boolean;
    message: string;
    marchers: number;
    sets: number;
    /**
     * Finishing steps that failed *after* the show itself was committed. The
     * import succeeded; these name what did not make it, so the user can redo
     * those bits by hand. See {@link finishingStep}.
     */
    warnings: string[];
};

/** Ordered stages of an import, surfaced to the UI as a plain-English checklist. */
export const DRILL_IMPORT_STEPS = [
    "read",
    "field",
    "sets",
    "marchers",
    "finish",
] as const;
export type DrillImportStep = (typeof DRILL_IMPORT_STEPS)[number];

/** Plain-English label shown for each import step. */
export const DRILL_IMPORT_STEP_LABELS: Record<DrillImportStep, string> = {
    read: "Reading the drill file",
    field: "Setting up the field",
    sets: "Building the sets and timing",
    marchers: "Placing your marchers",
    finish: "Adding music and finishing up",
};

/** Reports the step an import is starting. Pure UI callback — never touches the DB. */
export type DrillImportProgress = (step: DrillImportStep) => void;

/** Fallback per-count duration when the package has no SYNC timestamps. */
const DEFAULT_BEAT_DURATION_SECONDS = 0.5;

/** What the transactional part of an import produces. */
type ImportedShowCounts = { marchers: number; sets: number };

/**
 * Replaces the current show's marchers, pages, and coordinates with those from a
 * parsed drill package, all within a single undoable transaction.
 *
 * Deliberately not typed off {@link DrillImportResult}: `warnings` describes the
 * finishing steps that run *after* this commits, which this function knows
 * nothing about.
 */
// eslint-disable-next-line max-lines-per-function
export const _importDrillShow = async (
    show: DrillShow,
    onProgress?: DrillImportProgress,
): Promise<ImportedShowCounts> => {
    return await transactionWithHistory(
        db,
        "importDrillShow",
        // eslint-disable-next-line max-lines-per-function
        async (tx) => {
            onProgress?.("field");
            // Reconstruct (or match) the field the drill was designed on and set
            // it as the show's field, so coordinates land on the same geometry
            // instead of being stretched onto whatever field was loaded before.
            const field = resolveDrillField(show.grid);
            await tx
                .update(schema.field_properties)
                .set({ json_data: JSON.stringify(field) })
                .where(eq(schema.field_properties.id, 1))
                .run();

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

            onProgress?.("sets");
            // Beat durations come from the source SYNC track so tempo matches the
            // audio. FIRST_BEAT (count 0) is locked at duration 0, so it cannot
            // hold the count 0→1 interval; we create one beat per remaining count.
            // createdBeats[i] is count i+1 and carries the count (i+1)→(i+2)
            // interval, i.e. durations[i+1]. Dropping durations[0] (count 0→1)
            // shifts the whole grid earlier by that one interval; the audio offset
            // below trims to count 1 to compensate, so every count ≥1 lands exactly.
            const durations = beatDurationsFromSyncTimestamps({
                timestamps: show.audioSync?.timestamps,
                totalCounts: show.totalCounts,
                fallbackDuration: DEFAULT_BEAT_DURATION_SECONDS,
            });
            const newBeats: NewBeatArgs[] = durations
                .slice(1)
                .map((duration) => ({ duration, include_in_measure: true }));
            const createdBeats =
                newBeats.length > 0
                    ? await createBeatsInTransaction({
                          tx,
                          newBeats,
                          startingPosition: 0,
                      })
                    : [];
            // count c → the beat at that count. count 0 is FIRST_BEAT; count c≥1
            // is createdBeats[c-1] (beat position c).
            const beatIdAtCount = (count: number): number =>
                count <= 0 ? FIRST_BEAT_ID : createdBeats[count - 1]!.id;

            // OpenMarch shows a page's formation at the END of the page
            // (timestamp + duration). So a set's page must END on that set's
            // arrival beat: page for set i spans [set i-1 arrival, set i arrival].
            // set[0] is the opening formation on FIRST_PAGE (t=0). The first
            // created page begins at count 1 (FIRST_PAGE already owns count 0).
            const [, ...laterSets] = show.sets;
            const pageStartCounts = laterSets.map((_set, j) =>
                j === 0 ? 1 : show.sets[j]!.startCount,
            );
            const newPages: NewPageArgs[] = laterSets.map((set, j) => ({
                start_beat: beatIdAtCount(pageStartCounts[j]!),
                is_subset: set.isSubset,
                notes: set.notes ?? null,
            }));
            const createdPages =
                newPages.length > 0
                    ? await createPagesInTransaction({ tx, newPages })
                    : [];
            const pageIdForSet = (index: number): number =>
                index === 0 ? FIRST_PAGE_ID : createdPages[index - 1]!.id;

            const firstSetNotes = show.sets[0]?.notes;
            if (firstSetNotes) {
                await tx
                    .update(schema.pages)
                    .set({ notes: firstSetNotes })
                    .where(eq(schema.pages.id, FIRST_PAGE_ID))
                    .run();
            }

            onProgress?.("marchers");
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

            const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [];
            const pushCoords = (
                page_id: number,
                coordinates: DrillShow["sets"][number]["coordinates"],
            ) => {
                for (const [performerId, point] of Object.entries(
                    coordinates,
                )) {
                    const marcher_id = marcherIdByPerformer.get(performerId);
                    if (marcher_id === undefined) continue;
                    const { x, y } = sourcePointToPixels(
                        point,
                        show.grid,
                        field,
                    );
                    modifiedMarcherPages.push({ marcher_id, page_id, x, y });
                }
            };
            show.sets.forEach((set, index) =>
                pushCoords(pageIdForSet(index), set.coordinates),
            );
            await updateMarcherPagesInTransaction({ tx, modifiedMarcherPages });

            // The final page has no page after it to bound its end, so its length
            // is set explicitly — see `lastPageCountsForImport`. It gets its own
            // set's counts, the same as every other page; frames and audio past
            // the last set's arrival are timeline the drill has not reached and
            // stay as bare beats rather than stretching the closing move.
            const lastSet = show.sets.at(-1);
            if (lastSet) {
                await updateUtilityInTransaction({
                    tx,
                    args: {
                        last_page_counts: lastPageCountsForImport({
                            lastSetStartCount: lastSet.startCount,
                            previousPageStartCount: pageStartCounts.at(-1) ?? 0,
                        }),
                        notes: show.productionNotes ?? null,
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

/**
 * Imports embedded show audio (if any) via the main process, selecting it.
 *
 * IPC clones this buffer into the main process, which stores the bytes as a
 * BLOB. There is no path-based shortcut to avoid that clone: the audio lives
 * inside the `.3dz`, so producing a file for main to read would mean writing it
 * to disk first, which needs the bytes in main already. The clone is a one-time
 * cost during an explicit, progress-reported import.
 *
 * The copy we *can* avoid is this side's: slicing is only needed when the array
 * is a view into a larger buffer, which it is not when the unzip hands back a
 * standalone one.
 */
async function importDrillAudio(show: DrillShow): Promise<void> {
    if (!show.audio) return;
    const { data, name } = show.audio;
    const spansWholeBuffer =
        data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;
    const arrayBuffer = (
        spansWholeBuffer
            ? data.buffer
            : data.buffer.slice(
                  data.byteOffset,
                  data.byteOffset + data.byteLength,
              )
    ) as ArrayBuffer;
    await window.electron.insertAudioFileFromBuffer({
        data: arrayBuffer,
        nickname: name,
    });
}

/**
 * Runs a finishing step that happens *after* the import transaction commits,
 * turning a failure into a warning instead of an error.
 *
 * By the time these run, `_importDrillShow` has already replaced the previous
 * show: it is gone, and the new one is on screen. Rejecting here would surface
 * a "failed to import" toast over a show that did in fact import, and offer no
 * way back — the destructive part is not undone by the throw. Audio and
 * workspace settings are both additive and can be redone by hand, so a failure
 * is reported alongside the successful import rather than replacing it.
 */
async function finishingStep(
    warnings: string[],
    warning: string,
    step: () => Promise<void>,
): Promise<void> {
    try {
        await step();
    } catch (error) {
        console.error(warning, error);
        warnings.push(warning);
    }
}

/**
 * Parses a drill interchange package (`.3dz`) and imports it into the current
 * show: marchers, sets/pages, coordinates, embedded audio, and audio sync.
 */
export const importDrillPackage = async (
    file: File,
    onProgress?: DrillImportProgress,
): Promise<DrillImportResult> => {
    onProgress?.("read");
    const show = await parseDrillPackage(await file.arrayBuffer());
    const { marchers, sets } = await _importDrillShow(show, onProgress);
    onProgress?.("finish");

    const warnings: string[] = [];
    await finishingStep(warnings, tolgee.t("drill.audioNotImported"), () =>
        importDrillAudio(show),
    );
    await finishingStep(warnings, tolgee.t("drill.settingsNotApplied"), () =>
        applyDrillWorkspaceSettings(show),
    );

    return {
        success: true,
        message: show.title
            ? `Imported "${show.title}"`
            : "Imported drill file",
        marchers,
        sets,
        warnings,
    };
};

/**
 * Aligns workspace settings with the imported drill:
 * - `pageNumberOffset = 1` so page names match source (`1`, `1A`, `2` — not `0A`)
 * - `audioOffsetSeconds` trims the audio lead-in so the timeline lines up with
 *   the SYNC track. We trim to count 1 (`timestamps[1]`), not count 0, because
 *   OpenMarch's FIRST_BEAT (count 0) is a zero-duration anchor: count 1 is the
 *   first beat with real timeline presence, so aligning it to its SYNC time
 *   makes every set arrival land exactly on the music.
 */
async function applyDrillWorkspaceSettings(show: DrillShow): Promise<void> {
    const settings = await getWorkspaceSettingsParsed({ db });
    const timestamps = show.audioSync?.timestamps;
    const audioOffsetSeconds =
        timestamps && timestamps.length > 1 ? -timestamps[1]! : 0;
    await updateWorkspaceSettingsParsed({
        db,
        settings: {
            ...settings,
            pageNumberOffset: 1,
            audioOffsetSeconds,
        },
    });
}

/** React Query mutation that imports a drill package and refreshes all data. */
export const useImportDrillPackage = () => {
    const { fetchTimingObjects } = useTimingObjects();
    const { setPageToSelect } = useSelectedPage() ?? {};
    return useMutation({
        mutationFn: ({
            file,
            onProgress,
        }: {
            file: File;
            onProgress?: DrillImportProgress;
        }) => importDrillPackage(file, onProgress),
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
                // The import switches the show's field to match the source grid.
                queryClient.invalidateQueries({
                    queryKey: fieldPropertiesKeys.all,
                }),
                queryClient.invalidateQueries({
                    queryKey: workspaceSettingsKeys.all(),
                }),
            ]);
            await fetchTimingObjects();
            // Page ids are recreated during import; re-select the first set.
            setPageToSelect?.({ id: FIRST_PAGE_ID });
        },
        onError: (error) => {
            conToastError(tolgee.t("drill.importFailed"), error);
        },
    });
};
