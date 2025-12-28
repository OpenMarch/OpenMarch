import { FIRST_BEAT_ID, transactionWithHistory } from "@/db-functions";
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
import { useMutation } from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";
import tolgee from "@/global/singletons/Tolgee";
import {
    Measure as ParserMeasure,
    extractXmlFromMxlFile,
    parseMusicXml,
} from "@openmarch/musicxml-parser";
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

export type ImportResult = {
    success: boolean;
    message: string;
    stats?: {
        measure_count: number;
        tempo_group_count: number;
    };
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

// Database operation functions (private, prefixed with _)
// eslint-disable-next-line max-lines-per-function
export const _importMusicXmlFile = async ({
    data,
}: {
    data: MusicXmlImportData;
}): Promise<ImportResult> => {
    return await transactionWithHistory(
        db,
        "importMusicXmlFile",
        // eslint-disable-next-line max-lines-per-function
        async (tx) => {
            const { file, allPages, measures, allBeats } = data;

            // Import & parse MusicXML file + handle MXL files
            const xmlText = file.name.endsWith(".mxl")
                ? await extractXmlFromMxlFile(await file.arrayBuffer())
                : await file.text();
            let parsedMeasures: ParserMeasure[] = parseMusicXml(xmlText);

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
                    rehearsal_mark: measure.rehearsalMark,
                    notes: measure.notes,
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
                            dbBeats[measureStartBeatPositions[measureIdx]].id,
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
            const newBeatIds = new Set(dbBeats.map((b: DatabaseBeat) => b.id));
            const unusedBeats = allBeats.filter(
                (b) => !newBeatIds.has(b.id) && b.id !== FIRST_BEAT_ID,
            );
            if (unusedBeats.length > 0) {
                await deleteBeatsInTransaction({
                    tx,
                    beatIds: new Set(unusedBeats.map((b) => b.id)),
                });
            }

            return {
                success: true,
                message: tolgee.t("music.importSuccess", {
                    fileName: file.name,
                }),
                stats: {
                    measure_count: newMeasures.length,
                    tempo_group_count: 0, // Not implemented yet
                },
            };
        },
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
    return useMutation({
        mutationFn,
        onSuccess: async () => {
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
        (data: MusicXmlImportData) => _importMusicXmlFile({ data }),
        "music.importError",
    );
};
