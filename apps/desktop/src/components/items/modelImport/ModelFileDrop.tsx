import { useEffect } from "react";
import { hasModelFile } from "@/showAssets/modelImport/review/modelFiles";
import { isPreviewMode } from "@/stores/PreviewModeStore";
import { importModelFiles } from "./openModelImport";

const carriesFiles = (event: DragEvent) =>
    event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Dropping a `.glb`, or a `.gltf` with its files, anywhere on the editor starts an import and
 * shows its review in the Props panel (fork #999). Other dropped files are ignored, and never
 * open in the window in place of the app.
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
            if (
                !isPreviewMode() &&
                hasModelFile(files.map((file) => file.name))
            )
                void importModelFiles(files);
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
