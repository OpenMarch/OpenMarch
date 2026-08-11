/**
 * Launches a file dialogue to load an OpenMarch .dots file.
 * @returns Response data from the server.
 */
import { queryClient } from "@/App";
import { invalidateDatabaseReadyQueries } from "@/hooks/useDatabaseReady";
import { requestOpenNewShowDialog } from "@/utilities/openNewShowDialog";

export async function launchLoadFileDialogue() {
    const response = await window.electron.databaseLoad();
    return response;
}

/**
 * Launches a file dialogue to save a copy of the current file.
 * @returns Response data from the server.
 */
export async function launchSaveFileDialogue() {
    const response = await window.electron.databaseSave();
    return response;
}

/**
 * Opens the new-show dialog on the launch page (or after closing the current file).
 */
export async function launchNewFileDialogue() {
    await requestOpenNewShowDialog();
}

/**
 * Closes the current open .dots file,
 * @returns Response data from the server.
 */
export async function closeCurrentFile() {
    await invalidateDatabaseReadyQueries(queryClient);
    const response = await window.electron.closeCurrentFile();
    return response;
}
