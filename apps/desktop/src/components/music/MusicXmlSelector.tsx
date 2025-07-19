import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@openmarch/ui";
import {
    Measure as ParserMeasure,
    extractXmlFromMxlFile,
    parseMusicXml,
} from "musicxml-parser";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { deleteMeasures, createMeasures } from "@/global/classes/Measure";
import { createBeats } from "@/global/classes/Beat";
import { updatePages } from "@/global/classes/Page";
import { T, useTolgee } from "@tolgee/react";

// generates standard 120bpm 4/4 measures
function generateStandardMeasures(count: number): ParserMeasure[] {
    const measures: ParserMeasure[] = [];
    for (let i = 0; i < count; i++) {
        measures.push({
            number: i + 1, // or i, depending on your convention
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

export default function MusicXmlSelector() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const { t } = useTolgee();
    const { fetchTimingObjects, measures, beats } = useTimingObjectsStore();

    // Reassign existing pages to start of new measures
    async function reassignAllPagesToNewMeasureStarts(
        dbBeats: any[],
        measureStartBeatPositions: number[],
    ) {
        const allPages = await window.electron.getPages();
        if (!allPages.success) {
            throw new Error("Failed to fetch pages");
        }

        // Modify pages to point to new start beats
        const modifiedPagesArgs = allPages.data.map(
            (page: any, idx: number) => {
                const measureIdx =
                    idx < measureStartBeatPositions.length
                        ? idx
                        : measureStartBeatPositions.length - 1;
                return {
                    ...page,
                    start_beat:
                        dbBeats[measureStartBeatPositions[measureIdx]].id,
                };
            },
        );
        if (modifiedPagesArgs.length > 0) {
            await updatePages(modifiedPagesArgs, fetchTimingObjects);
        }
    }

    // Delete all beats that are not in the new set of beats
    async function deleteBeatsNotIn(newBeatIds: Set<number>) {
        const allBeats = await window.electron.getBeats();
        if (!allBeats.success) throw new Error("Failed to fetch all beats");

        // Filter out old beats
        const unusedBeats = allBeats.data.filter(
            (b: any) => !newBeatIds.has(b.id),
        );
        if (unusedBeats.length > 0) {
            await window.electron.deleteBeats(
                new Set(unusedBeats.map((b: any) => b.id)),
            );
        }
    }

    // XML import handler
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);

        try {
            // Import & parse MusicXML file + handle MXL files.
            const xmlText = file.name.endsWith(".mxl")
                ? await extractXmlFromMxlFile(await file.arrayBuffer())
                : await file.text();
            let parsedMeasures: ParserMeasure[] = parseMusicXml(xmlText);

            // Get page count
            const allPages = await window.electron.getPages();
            if (!allPages.success) throw new Error("Failed to fetch pages");
            const pageCount = allPages.data.length;

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
                await deleteMeasures(
                    new Set(measures.map((m) => m.id)),
                    fetchTimingObjects,
                );
            }

            // Prepare new beats and store their grouping to measures
            let beatPosition = 0;
            const measureStartBeatPositions: number[] = [];
            const newBeats = parsedMeasures.flatMap((measure) => {
                measureStartBeatPositions.push(beatPosition);
                return measure.beats.map((beat) => ({
                    position: beatPosition++,
                    duration: beat.duration,
                    include_in_measure: 1 as const,
                    notes: beat.notes,
                }));
            });

            // Insert new beats
            const beatsResponse = await createBeats(
                newBeats,
                fetchTimingObjects,
                0,
            );
            if (!beatsResponse.success)
                throw new Error("Failed to create beats");
            const dbBeats = beatsResponse.data;

            // Insert new measures with their new start beats
            const newMeasures = parsedMeasures.map((measure, i) => ({
                start_beat: dbBeats[measureStartBeatPositions[i]].id,
                rehearsal_mark: measure.rehearsalMark,
                notes: measure.notes,
            }));
            const measuresResponse = await createMeasures(
                newMeasures,
                fetchTimingObjects,
            );
            if (!measuresResponse.success)
                throw new Error("Failed to create measures");

            // Reassign start_beat for all pages to new measures
            await reassignAllPagesToNewMeasureStarts(
                dbBeats,
                measureStartBeatPositions,
            );

            // Delete old beats now that they are not referenced
            const newBeatIds = new Set(dbBeats.map((b: any) => b.id));
            await deleteBeatsNotIn(newBeatIds);

            // Refresh UI
            await fetchTimingObjects();
            toast.success(
                // "MusicXML file: '" + file.name + "' imported successfully!",
                t("music.importSuccess", { fileName: file.name }),
            );
        } catch (err) {
            toast.error(t("music.importError"));
            console.error("Error importing MusicXML file:", err);
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="mt-8 flex items-center gap-8 px-12">
            <label className="text-body text-text/80 w-full">
                <T keyName="music.importLabel" />
            </label>
            <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.musicxml,.mxl"
                className="hidden"
                onChange={handleFileChange}
            />
            <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="whitespace-nowrap"
            >
                {importing ? t("music.importing") : t("music.importButton")}
            </Button>
        </div>
    );
}
