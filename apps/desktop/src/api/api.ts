/**
 * Launches a file dialogue to load an OpenMarch .dots file.
 * @returns Response data from the server.
 */
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
 * Launches a file dialogue to create a new OpenMarch .dots file.
 * @returns Response data from the server.
 */
export async function launchNewFileDialogue() {
    const response = await window.electron.databaseCreate();
    return response;
}

/**
 * Closes the current open .dots file,
 * @returns Response data from the server.
 */
export async function closeCurrentFile() {
    const response = await window.electron.closeCurrentFile();
    return response;
}
