import { transactionWithHistory } from "@/db-functions";
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
import { measureKeys } from "@/hooks/queries/useMeasures";
import { beatKeys } from "@/hooks/queries/useBeats";
import { pageKeys } from "@/hooks/queries/usePages";
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

// Types and interfaces
export type MusicXmlImportData = {
    file: File;
    allPages: any[];
    measures: any[];
    allBeats: any[];
};

export type ImportResult = {
    success: boolean;
    message: string;
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
export const _importMusicXmlFile = async ({
    data,
}: {
    data: MusicXmlImportData;
}): Promise<ImportResult> => {
    return await transactionWithHistory(
        db,
        "importMusicXmlFile",
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
                (b: any) => !newBeatIds.has(b.id),
            );
            if (unusedBeats.length > 0) {
                await deleteBeatsInTransaction({
                    tx,
                    beatIds: new Set(unusedBeats.map((b: any) => b.id)),
                });
            }

            return {
                success: true,
                message: tolgee.t("music.importSuccess", {
                    fileName: file.name,
                }),
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
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: (result) => {
            // Invalidate all of the relevant queries
            queryClient.invalidateQueries({
                queryKey: measureKeys.all(),
            });
            queryClient.invalidateQueries({
                queryKey: beatKeys.all(),
            });
            queryClient.invalidateQueries({
                queryKey: pageKeys.all(),
            });

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
