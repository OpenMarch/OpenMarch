import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@openmarch/ui";
import {
    Measure as ParserMeasure,
    extractXmlFromMxlFile,
    parseMusicXml,
} from "musicxml-parser/src/parser";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { deleteMeasures, createMeasures } from "@/global/classes/Measure";
import { createBeats } from "@/global/classes/Beat";
import { updatePages } from "@/global/classes/Page";

// Helper to clear all page start_beat references
async function clearAllPageStartBeats(fetchTimingObjects: () => Promise<void>) {
    const allPagesResponse = await window.electron.getPages();
    if (!allPagesResponse.success) {
        throw new Error("Failed to fetch pages");
    }

    // Prepare updates for all pages
    const modifiedPagesArgs = allPagesResponse.data.map((page: any) => ({
        id: page.id,
        start_beat: -1,
    }));

    if (modifiedPagesArgs.length > 0) {
        await updatePages(modifiedPagesArgs, fetchTimingObjects);
    }
}

export default function MusicXmlSelector() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const { fetchTimingObjects, measures, beats } = useTimingObjectsStore();

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
            const parsedMeasures: ParserMeasure[] = parseMusicXml(xmlText);

            // Clear beat references in all pages
            await clearAllPageStartBeats(fetchTimingObjects);

            // Delete existing measures and beats
            if (measures.length > 0) {
                await deleteMeasures(
                    new Set(measures.map((m) => m.id)),
                    fetchTimingObjects,
                );
            }
            if (beats.length > 0) {
                await window.electron.deleteBeats(
                    new Set(beats.map((b) => b.id)),
                );
            }

            // Prepare new beats for measures
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

            // Convert ParserMeasure to Measure format, adding beat IDs
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
            toast.success(
                "MusicXML file: '" + file.name + "' imported successfully!",
            );
        } catch (err) {
            toast.error("Failed to import MusicXML file: " + err);
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
                accept=".xml,.musicxml,.mxl"
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
        </div>
    );
}
