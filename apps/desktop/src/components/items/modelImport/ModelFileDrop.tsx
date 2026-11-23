import { useEffect } from "react";
import { readDroppedModel } from "@/showAssets/modelImport/review/modelFiles";
import { isPreviewMode } from "@/stores/PreviewModeStore";
import { importPickedFiles } from "./openModelImport";

const carriesFiles = (event: DragEvent) =>
    event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Dropping a `.glb`, a `.gltf` with its files, or a zip with a model inside (#1168) anywhere on
 * the editor starts an import and shows its review in the Props panel (fork #999). Other dropped
 * files are ignored, and never open in the window in place of the app.
 */
export default function ModelFileDrop() {
    useEffect(() => {
        const onDragOver = (event: DragEvent) => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        };
        const onDrop = (event: DragEvent) => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            const files = [...(event.dataTransfer?.files ?? [])];
            // Preview hides the sidebar, where the review shows
            if (isPreviewMode()) return;
            void readDroppedModel(files).then(
                (picked) => picked && importPickedFiles(picked),
            );
        };
        window.addEventListener("dragover", onDragOver);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragover", onDragOver);
            window.removeEventListener("drop", onDrop);
        };
    }, []);
    return null;
}
