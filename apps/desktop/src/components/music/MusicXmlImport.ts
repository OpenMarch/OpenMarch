import { withTimelinePageRipple } from "@/db-functions/timelineRipple";
import {
    FIRST_BEAT_ID,
    remapCuesOntoReplacementBeatsInTransaction,
    remapItemChangesOntoReplacementBeatsInTransaction,
    transactionWithHistory,
} from "@/db-functions";
import {
    createBeatsInTransaction,
    deleteBeatsInTransaction,
} from "@/db-functions";
import {
    createMeasuresInTransaction,
    deleteMeasuresInTransaction,
} from "@/db-functions";
import { updatePagesInTransaction } from "@/db-functions";
import { db } from "@/global/database/db";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { itemGeometryKeys } from "@/hooks/queries/useItems";
import { cueKeys } from "@/hooks/queries/useCues";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import {
    Measure as ParserMeasure,
    parseMusicXmlWithReport,
    readMusicXmlFile,
    type MusicXmlParseResult,
} from "@openmarch/musicxml-parser";
import { importChecks, type ImportCheck } from "./musicXmlImportChecks";
import { DatabaseBeat, NewBeatArgs } from "@/db-functions";
import { NewMeasureArgs } from "@/db-functions";
import { ModifiedPageArgs } from "@/db-functions";
import Page from "@/global/classes/Page";
import Measure from "@/global/classes/Measure";
import Beat from "@/global/classes/Beat";
import { useTimingObjects } from "@/hooks";

// Types and interfaces
export type MusicXmlImportData = {
    file: File;
    allPages: Page[];
    measures: Measure[];
    allBeats: Beat[];
};

/** What the database writes need: the parsed score in place of the file. */
export type MusicXmlImportWrite = Omit<MusicXmlImportData, "file"> & {
    fileName: string;
    parsed: MusicXmlParseResult;
};

export type ImportResult = {
    success: boolean;
    message: string;
    /** What the importer guessed or couldn't read, to check in the score */
    checks: ImportCheck[];
};

// generates standard 120bpm 4/4 measures
function generateStandardMeasures(count: number): ParserMeasure[] {
    const measures: ParserMeasure[] = [];
    for (let i = 0; i < count; i++) {
        measures.push({
            number: i + 1,
            rehearsalMark: undefined,
            notes: undefined,
            beats: Array.from({ length: 4 }, () => ({
                duration: 0.5, // 120bpm
                notes: undefined,
            })),
        });
    }
    return measures;
}

/**
 * Reads the file's bytes (compressed or not, any text encoding) and parses it, outside any
 * transaction, so a file that can't be read fails before the import touches the show. Measures
 * come in the order they are played, repeats played out.
 */
export const parseMusicXmlFile = async (
    file: Pick<Blob, "arrayBuffer">,
): Promise<MusicXmlParseResult> => {
    const parsed = parseMusicXmlWithReport(
        await readMusicXmlFile(await file.arrayBuffer()),
    );
    if (parsed.measures.length === 0)
        throw new Error("The file has no measures");
    return parsed;
};

// Database operation functions (private, prefixed with _)
// eslint-disable-next-line max-lines-per-function
export const _importMusicXmlFile = async ({
    data,
}: {
    data: MusicXmlImportWrite;
}): Promise<ImportResult> => {
    return await transactionWithHistory(
        db,
        "importMusicXmlFile",
        // eslint-disable-next-line max-lines-per-function
        async (tx) =>
            // eslint-disable-next-line max-lines-per-function
            await withTimelinePageRipple(tx, async () => {
                const { fileName, parsed, allPages, measures, allBeats } = data;
                let parsedMeasures: ParserMeasure[] = parsed.measures;

                // Get page count
                if (!allPages) throw new Error("Failed to fetch pages");
                const pageCount = allPages.length;

                // Add standard measures if more pages than measures
                if (parsedMeasures.length < pageCount) {
                    parsedMeasures = [
                        ...parsedMeasures,
                        ...generateStandardMeasures(
                            pageCount - parsedMeasures.length,
                        ),
                    ];
                }

                // Delete existing measures
                if (measures.length > 0) {
                    await deleteMeasuresInTransaction({
                        tx,
                        itemIds: new Set(measures.map((m) => m.id)),
                    });
                }

                // Prepare new beats and store their grouping to measures
                let beatPosition = 0;
                const measureStartBeatPositions: number[] = [];
                const newBeats: NewBeatArgs[] = parsedMeasures.flatMap(
                    (measure) => {
                        measureStartBeatPositions.push(beatPosition);
                        return measure.beats.map((beat) => ({
                            position: beatPosition++,
                            duration: beat.duration,
                            include_in_measure: true,
                            notes: beat.notes,
                        }));
                    },
                );

                // Insert new beats
                const dbBeats = await createBeatsInTransaction({
                    tx,
                    newBeats,
                    startingPosition: 0,
                });

                // Insert new measures with their new start beats
                const newMeasures: NewMeasureArgs[] = parsedMeasures.map(
                    (measure, i) => ({
                        start_beat: dbBeats[measureStartBeatPositions[i]].id,
                        // Each pass of a repeated section gets its own mark: A, A-2, A-3
                        rehearsal_mark:
                            measure.rehearsalMark &&
                            measure.time &&
                            measure.time > 1
                                ? `${measure.rehearsalMark}-${measure.time}`
                                : measure.rehearsalMark,
                        // A measure played again by a repeat says which written measure it is
                        notes:
                            measure.notes ??
                            (measure.time && measure.time > 1
                                ? tolgee.t("music.repeatPlayNote", {
                                      label: measure.label ?? "",
                                      time: measure.time,
                                  })
                                : undefined),
                    }),
                );
                await createMeasuresInTransaction({
                    tx,
                    newItems: newMeasures,
                });

                // Reassign start_beat for all pages to new measures
                const modifiedPagesArgs: ModifiedPageArgs[] = allPages.map(
                    (page: any, idx: number) => {
                        const measureIdx =
                            idx < measureStartBeatPositions.length
                                ? idx
                                : measureStartBeatPositions.length - 1;
                        return {
                            id: page.id,
                            start_beat:
                                dbBeats[measureStartBeatPositions[measureIdx]]
                                    .id,
                        };
                    },
                );
                if (modifiedPagesArgs.length > 0) {
                    await updatePagesInTransaction({
                        tx,
                        modifiedPages: modifiedPagesArgs,
                    });
                }

                // Delete old beats now that they are not referenced
                const newBeatIds = new Set(
                    dbBeats.map((b: DatabaseBeat) => b.id),
                );
                const unusedBeats = allBeats.filter(
                    (b) => !newBeatIds.has(b.id) && b.id !== FIRST_BEAT_ID,
                );
                if (unusedBeats.length > 0) {
                    const beatIds = new Set(unusedBeats.map((b) => b.id));
                    // Item changes and cues move to the new beat at their time instead of
                    // going with the old beats
                    await remapItemChangesOntoReplacementBeatsInTransaction({
                        tx,
                        beatIds,
                    });
                    await remapCuesOntoReplacementBeatsInTransaction({
                        tx,
                        beatIds,
                    });
                    await deleteBeatsInTransaction({ tx, beatIds });
                }

                return {
                    success: true,
                    message: tolgee.t("music.importSuccess", {
                        fileName,
                    }),
                    checks: importChecks(parsed),
                };
            }),
    );
};

// React Query mutation hooks
/**
 * @param mutationFn - The mutation function to run
 * @param errorKey - The tolgee key to display on error (create one if it doesn't exist)
 * @param successKey - Optional, the tolgee key to display on success
 */
const useMusicXmlMutation = <TArgs>(
    mutationFn: (args: TArgs) => Promise<ImportResult>,
    errorKey: string,
    successKey?: string,
) => {
    const { fetchTimingObjects } = useTimingObjects();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: async () => {
            // Item Outline changes and cues moved to the new beats
            void queryClient.invalidateQueries({
                queryKey: itemGeometryKeys.all(),
            });
            void queryClient.invalidateQueries({ queryKey: cueKeys.all() });
            // This happens twice to bypass the errors. There's likely a better solution
            await fetchTimingObjects();
            await fetchTimingObjects();
            if (successKey) {
                tolgee.t(successKey);
            }
        },
        onError: (error) => {
            conToastError(tolgee.t(errorKey), error);
        },
    });
};

// Public mutation hooks
export const useImportMusicXml = () => {
    return useMusicXmlMutation(
        async ({ file, ...rest }: MusicXmlImportData) =>
            _importMusicXmlFile({
                data: {
                    ...rest,
                    fileName: file.name,
                    parsed: await parseMusicXmlFile(file),
                },
            }),
        "music.importError",
    );
};
