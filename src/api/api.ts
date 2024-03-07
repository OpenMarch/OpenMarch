// import axios from 'axios';
import * as Interfaces from '../global/Interfaces';

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

export async function getFieldProperties(): Promise<Interfaces.FieldProperties> {
  const response = await window.electron.getFieldProperties();
  return response;
}

/* ====================== Page ====================== */

// /**
//  * @returns a list of all pages.
//  */
// export async function getPages(): Promise<Interfaces.Page[]> {
//   const response = await window.electron.getPages();
//   return response;
// }

// export async function createPage(newPage: Interfaces.NewPage) {
//   return await createPages([newPage]);
// }

// export async function createPages(pages: Interfaces.NewPage[]) {
//   const response = await window.electron.createPages(pages);
//   return response;
// }

// /**
//  * Update one or many pages.
//  * Must fetch pages after updating.
//  *
//  * @param pageUpdates
//  * @returns Response data from the server.
//  */
// export async function updatePages(pageUpdates: Interfaces.UpdatePage[]) {
//   const response = await window.electron.updatePages(pageUpdates);
//   return response;
// }

// /**
//  * Deletes a page from the database.
//  *
//  * CAUTION - this will delete all of the marcherPages associated with the page.
//  * THIS CANNOT BE UNDONE.
//  *
//  * @param page_id - The id of the page. Do not use id_for_html.
//  * @returns Response data from the server.
//  */
// export async function deletePage(page_id: number) {
//   const response = await window.electron.deletePage(page_id);
//   return response;
// }

/* ====================== MarcherPage ====================== */

// /**
//  * Do not use id_for_html, use id.
//  *
//  * @param {number} marcher_id - marcherObj.id: The id of the marcher.
//  * @param {number} page_id - pageObj.id: The id of the page.
//  * @returns {MarcherPage} The marcherPage object for the given marcher_id and page_id.
//  */
// export async function getMarcherPage(marcher_id: number, page_id: number): Promise<MarcherPage> {
//   const response = await window.electron.getMarcherPage({ marcher_id: marcher_id, page_id: page_id });
//   return response;
// }

// /**
//  * Pass no arguments to get all marcherPages.
//  * Use id_for_html, not id. This is for integrated type checking.
//  *
//  * @param {string} id_for_html - obj.id_for_html: the id_for_html of the marcher or page.
//  * @returns A list of all the marcherPages or those for either a given marcher or page.
//  */
// export async function getMarcherPages(id_for_html: string | void): Promise<MarcherPage[]> {
//   let response = await window.electron.getMarcherPages({});

//   if (id_for_html) {
//     // Trim the "marcher_" or "page_" prefix off the html id
//     const id = parseInt(id_for_html.substring(id_for_html.indexOf('_') + 1));
//     if (id_for_html.includes(Constants.MarcherPrefix))
//       response = window.electron.getMarcherPages({ marcher_id: id });
//     else if (id_for_html.includes(Constants.PagePrefix))
//       response = window.electron.getMarcherPages({ page_id: id });
//   }

//   return response;
// }

// /**
//  * Updates the x and y coordinates for a given marcherPage.
//  * Must fetch marcherPages after updating.
//  *
//  * @param marcher_id
//  * @param page_id
//  * @param x
//  * @param y
//  * @returns Response data from the server.
//  */
// export async function updateMarcherPage(marcher_id: number, page_id: number, x: number, y: number) {
//   // console.log("JSON: " + JSON.stringify({ x, y }));
//   const updatedMarcherPage: Interfaces.UpdateMarcherPage = {
//     marcher_id: marcher_id,
//     page_id: page_id,
//     x: x,
//     y: y
//   };
//   const response = await window.electron.updateMarcherPages([updatedMarcherPage]);
//   return response;
// }

// /**
//  * Updates the x and y coordinates for a list of marcherPages defined using the UpdateMarcherPage interface.
//  *
//  * @param marcherPages A list of marcherPages to update.
//  * @returns Response data from the server.
//  */
// export async function updateMarcherPages(marcherPages: Interfaces.UpdateMarcherPage[]) {
//   const response = await window.electron.updateMarcherPages(marcherPages);
//   return response;
// }
