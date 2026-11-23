import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { useModelImportSession } from "@/showAssets/modelImport/review/modelImportSession";
import {
    pickModelFiles,
    readPickedFiles,
} from "@/showAssets/modelImport/review/modelFiles";
import type { PickedFile } from "@/showAssets/modelImport/types";
import { PropListContents } from "../PropsModal";
import ModelImportReview from "./ModelImportReview";

/** The Props panel's id in the sidebar */
const PROPS_PANEL_ID = "props";

/** Shows the import's review in the Props panel; leaving it returns to the props list */
export function showModelImportReview() {
    const { setContent, setOpen } = useSidebarModalStore.getState();
    setContent(
        <ModelImportReview
            onDone={(modelValue) =>
                setContent(
                    <PropListContents justImported={modelValue} />,
                    PROPS_PANEL_ID,
                )
            }
        />,
        PROPS_PANEL_ID,
    );
    setOpen(true);
}

/** Starts an import of these files (picked, or dropped on the app) and shows its review */
export async function importModelFiles(files: Iterable<File>) {
    importPickedFiles(await readPickedFiles(files));
}

/** Starts an import of files already read and shows its review */
export function importPickedFiles(picked: PickedFile[]) {
    useModelImportSession.getState().open(picked);
    showModelImportReview();
}

/**
 * The `importModel` action (the Props panel's Import… tile): asks for a model's files, then
 * shows the review. Picking nothing changes nothing.
 */
export async function importModel() {
    const files = await pickModelFiles();
    if (files) await importModelFiles(files);
}
