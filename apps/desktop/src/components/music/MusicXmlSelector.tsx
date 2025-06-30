import { useRef, useState } from "react";
import { Button } from "@openmarch/ui";
import { parseMusicXml } from "musicxml-parser/src/parser";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import {
    cascadeDeleteMeasures,
    createMeasures,
} from "@/global/classes/Measure";
import { createBeats } from "@/global/classes/Beat";
import { Measure as ParserMeasure } from "musicxml-parser/src/parser";

export default function MusicXmlSelector() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importedFileName, setImportedFileName] = useState<string | null>(
        null,
    );
    const [importing, setImporting] = useState(false);
    const { fetchTimingObjects, measures } = useTimingObjectsStore();

    // XML import handler
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);

        try {
            // Import and parse file
            setImportedFileName(null);
            const xmlText = await file.text();
            const parsedMeasures: ParserMeasure[] = parseMusicXml(xmlText);

            // Clear existing measures
            await cascadeDeleteMeasures(measures, fetchTimingObjects);

            // Convert ParserBeat to Beat format
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

            // Insert Beats
            const beatsResponse = await createBeats(
                newBeats,
                fetchTimingObjects,
                0,
            );
            if (!beatsResponse.success)
                throw new Error("Failed to create beats");
            const dbBeats = beatsResponse.data;

            // Convert ParserMeasure to Measure format
            const newMeasures = parsedMeasures.map((measure, i) => ({
                start_beat: dbBeats[measureStartBeatPositions[i]].id,
                rehearsal_mark: measure.rehearsalMark,
                notes: measure.notes,
            }));

            // Insert Measures
            const measuresResponse = await createMeasures(
                newMeasures,
                fetchTimingObjects,
            );
            if (!measuresResponse.success)
                throw new Error("Failed to create measures");

            // Refresh UI
            await fetchTimingObjects();
            setImportedFileName(file.name);
        } catch (err) {
            console.error("Error importing MusicXML file:", err);
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="mt-8 flex items-center gap-8 px-12">
            <label className="text-body text-text/80 w-full">
                MusicXML Import
            </label>
            <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.musicxml"
                className="hidden"
                onChange={handleFileChange}
            />
            <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="whitespace-nowrap"
            >
                {importing ? "Importing..." : "Import MusicXML File"}
            </Button>
            {importedFileName && (
                <span className="text-text-subtitle text-sub ml-4">
                    Imported: {importedFileName}
                </span>
            )}
        </div>
    );
}
