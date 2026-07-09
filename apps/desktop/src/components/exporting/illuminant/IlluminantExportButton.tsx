import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import {
    buildIlluminantVisualizerRequest,
    postIlluminantVisualizerRequest,
} from "./illuminantExport";

function createVisualizerFilename(): string {
    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    return `openmarch-preview-${timestamp}.mp4`;
}

export default function IlluminantExportButton() {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        console.info("[Illuminant export] Export button clicked");
        setIsExporting(true);
        try {
            console.info("[Illuminant export] Building visualizer request");
            const request = await buildIlluminantVisualizerRequest({
                filename: createVisualizerFilename(),
            });
            console.info(
                "[Illuminant export] Sending request to Electron main",
                {
                    filename: request.filename,
                    beatCount: request.showData.beats.length,
                    pageCount: request.showData.pages.length,
                    sceneCount: request.lightingData.scenes.length,
                    effectCount: request.lightingData.effects.length,
                },
            );
            const response = await postIlluminantVisualizerRequest(request);
            console.info("[Illuminant export] Visualizer response", response);

            if (!response.success) {
                throw new Error(response.error || "Visualizer export failed");
            }

            toast.success("Illuminant export complete", {
                description: response.outputPath,
            });
        } catch (error) {
            toast.error("Illuminant export failed", {
                description:
                    error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <button
            type="button"
            disabled={isExporting}
            onClick={() => void handleExport()}
            className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
        >
            <ArrowSquareOutIcon size={24} />
            {isExporting ? "EXPORTING" : "EXPORT"}
        </button>
    );
}
