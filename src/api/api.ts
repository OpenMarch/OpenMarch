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
 * Performs an undo action by popping the last action off the history stack.
 * @returns Response data from the server.
 */
export async function performUndo() {
    const response = await window.electron.undo();
    return response;
}

/**
 * Performs a redo action by popping the last action off the redo stack.
 * Note, the redo stack is deleted when a new action is performed.
 * @returns Response data from the server.
 */
export async function performRedo() {
    const response = await window.electron.redo();
    return response;
}
