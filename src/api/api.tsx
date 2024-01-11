// import axios from 'axios';
import { Marcher, NewMarcher, NewPage, Page, UpdateMarcher, UpdateMarcherPage, UpdatePage } from '../Interfaces';
import { Constants } from '../Constants';
import { Update } from 'vite/types/hmrPayload';
import { create } from 'domain';

/* ====================== General ====================== */
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

/* ====================== Page ====================== */

/**
 * @returns a list of all pages.
 */
export async function getPages() {
  const response = await window.electron.getPages();
  return response;
}

export async function createPage(newPage: NewPage) {
  return await createPages([newPage]);
}

export async function createPages(pages: NewPage[]) {
  const response = await window.electron.createPages(pages);
  return response;
}

/**
 * Update one or many pages.
 * Must fetch pages after updating.
 *
 * @param pageUpdates
 * @returns Response data from the server.
 */
export async function updatePages(pageUpdates: UpdatePage[]) {
  const response = await window.electron.updatePages(pageUpdates);
  return response;
}

/* ====================== Marcher ====================== */

/**
 * @returns a list of all marchers
 */
export async function getMarchers(): Promise<Marcher[]> {
  const response = await window.electron.getMarchers();
  return response;
}

export async function updateMarchers(updateMarchers: UpdateMarcher[]) {
  const response = await window.electron.updateMarchers(updateMarchers);
  return response;
}

/**
 * TODO: NOT TESTED
 * Deletes a marcher from the database. Careful!
 * Currently, this will delete all marcherPages associated with the marcher.
 * This cannot be undone.
 *
 * @param id - marcherObj.id: The id of the marcher. Do not use id_for_html.
 * @returns Response data.
 */
// export async function deleteMarcher(id: number) {
//   const response = await window.electron.deleteMarcher(id);
//   return response;
// }

/**
 * Creates a new marcher in the database.
 *
 * @param marcher - The new marcher object to be created.
 * @returns Response data.
 */
export async function createMarcher(newMarcher: NewMarcher) {
  const response = await window.electron.createMarcher(newMarcher);
  return response;
}

/* ====================== MarcherPage ====================== */

/**
 * Do not use id_for_html, use id.
 *
 * @param {number} marcher_id - marcherObj.id: The id of the marcher.
 * @param {number} page_id - pageObj.id: The id of the page.
 * @returns {MarcherPage} The marcherPage object for the given marcher_id and page_id.
 */
export async function getMarcherPage(marcher_id: number, page_id: number) {
  const response = await window.electron.getMarcherPage({ marcher_id: marcher_id, page_id: page_id });
  return response;
}

/**
 * Pass no arguments to get all marcherPages.
 * Use id_for_html, not id. This is for integrated type checking.
 *
 * @param {string} id_for_html - obj.id_for_html: the id_for_html of the marcher or page.
 * @returns A list of all the marcherPages or those for either a given marcher or page.
 */
export async function getMarcherPages(id_for_html: string | void) {
  let response = await window.electron.getMarcherPages({});

  if (id_for_html) {
    // Trim the "marcher_" or "page_" prefix off the html id
    const id = parseInt(id_for_html.substring(id_for_html.indexOf('_') + 1));
    if (id_for_html.includes(Constants.MarcherPrefix))
      response = window.electron.getMarcherPages({ marcher_id: id });
    else if (id_for_html.includes(Constants.PagePrefix))
      response = window.electron.getMarcherPages({ page_id: id });
  }

  return response;
}

/**
 * Updates the x and y coordinates for a given marcherPage.
 * Must fetch marcherPages after updating.
 *
 * @param marcher_id
 * @param page_id
 * @param x
 * @param y
 * @returns Response data from the server.
 */
export async function updateMarcherPage(marcher_id: number, page_id: number, x: number, y: number) {
  // console.log("JSON: " + JSON.stringify({ x, y }));
  const updatedMarcherPage: UpdateMarcherPage = {
    marcher_id: marcher_id,
    page_id: page_id,
    x: x,
    y: y
  };
  const response = await window.electron.updateMarcherPage(updatedMarcherPage);
  return response;
}
