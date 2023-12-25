// import axios from 'axios';
import { Marcher, NewMarcher, NewPage, Page } from '../Interfaces';
import { Constants } from '../Constants';


const m_table = Constants.MarcherTableName;
const p_table = Constants.PageTableName;

const API_URL = 'http://localhost:3001/api/v1';

/* ====================== Page ====================== */

/**
 * @returns a list of all pages.
 */
export async function getPages() {
  // const response = await axios.get(API_URL + '/pages');
  // return response.data;
}

export async function createPage(page: Page | NewPage) {
  // const newPage: NewPage = {
  //   name: page.name,
  //   counts: page.counts
  // };
  // // console.log("newPage JSOn: " + JSON.stringify(newPage));
  // const response = await axios.post(API_URL + '/pages', JSON.stringify(newPage), {
  //   headers: {
  //     'Content-Type': 'application/json',
  //   },
  // });
  // return response.data;
}

/**
 * Updates the counts for a given page.
 * Must fetch pages after updating.
 *
 * @param {number} id - pageObj.id: The id of the page. Do not use id_for_html.
 * @param {number} counts - The new amount of counts for the page to be.
 * @returns Response data from the server.
 */
export async function updatePageCounts(id: number, counts: number) {
  // const response = await axios.patch(API_URL + `/pages/${id}`, { counts });
  // return response.data;
}

/* ====================== Marcher ====================== */

/**
 * @returns a list of all marchers
 */
export async function getMarchers(): Promise<Marcher[]> {
  // return
  const response = await window.electron.getMarchers();
  return response;
}

/**
 * TODO: NOT TESTED
 * Updates the drill number for a given marcher.
 * A drill number cannot be updated as one string, "B1" for example. It must be updated as a prefix "B" and order 1.
 *
 * @param {number} id - marcherObj.id: The id of the marcher. Do not use id_for_html.
 * @param {string} drill_prefix - (B1 -> "B") The drill prefix for the marcher to be.
 * @param {number} drill_order - (B1 -> 1) The drill order for the marcher to be.
 * @returns Response data from the server.
 */
export async function updateMarcherDrillNumber(id: number, drill_prefix: string, drill_order: number) {
  const response = await window.electron.updateMarcher({ id: id, drill_prefix: drill_prefix, drill_order: drill_order });
  return response;
}

/**
 * Updates the instrument/section for a given marcher.
 *
 * @param id - marcherObj.id: The id of the marcher. Do not use id_for_html.
 * @param section - The new instrument/section for the marcher to be.
 * @returns response data.
 */
export async function updateMarcherSection(id: number, section: string) {
  const response = await window.electron.updateMarcher({ id: id, section: section });
  return response;
}

/**
 * Updates the name for a given marcher.
 *
 * @param id - marcherObj.id: The id of the marcher. Do not use id_for_html.
 * @param name - The new name for the marcher to be.
 * @returns Response data.
 */
export async function updateMarcherName(id: number, name: string) {
  const response = await window.electron.updateMarcher({ id: id, name: name });
  return response;
}

/**
 * Updates the given marcher with the given newMarcher object.
 *
 * @param id - marcherObj.id: The id of the marcher. Do not use id_for_html.
 * @param marcher - The newMarcher object for the marcher to be.
 * @returns Response data.
 */
export async function updateMarcher(id: number, marcher: NewMarcher) {
  const response = await window.electron.updateMarcher({ id: id, ...marcher });
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
export async function deleteMarcher(id: number) {
  const response = await window.electron.deleteMarcher(id);
  return response;
}

/**
 * Creates a new marcher in the database.
 *
 * @param marcher - The new marcher object to be created.
 * @returns Response data.
 */
export async function createMarcher(marcher: NewMarcher) {
  const newMarcher: NewMarcher = {
    name: marcher.name,
    section: marcher.section,
    drill_prefix: marcher.drill_prefix,
    drill_order: marcher.drill_order
  };
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
  // const response = await axios.get(API_URL + `/${m_table}/${marcher_id}/${p_table}/${page_id}/marcher_pages`);
  // return response.data;
}

/**
 * Pass no arguments to get all marcherPages.
 * Use id_for_html, not id. This is for integrated type checking.
 *
 * @param {string} id_for_html - obj.id_for_html: the id_for_html of the marcher or page.
 * @returns A list of all the marcherPages or those for either a given marcher or page.
 */
export async function getMarcherPages(id_for_html: string | void) {
  // let arg_string = '';

  // if (id_for_html) {
  //   // Trim the "marcher_" or "page_" prefix off the html id
  //   const id = id_for_html.substring(id_for_html.indexOf('_') + 1);
  //   if (id_for_html.includes('marcher'))
  //     arg_string = `/${m_table}/${id}`;
  //   else if (id_for_html.includes('page'))
  //     arg_string = `/${p_table}/${id}`;
  // }

  // const response = await axios.get(API_URL + arg_string + '/marcher_pages');
  // return response.data;
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
  // // console.log("JSON: " + JSON.stringify({ x, y }));
  // const response = await axios.patch(API_URL + `/${m_table}/${marcher_id}/${p_table}/${page_id}/marcher_pages`,
  //   JSON.stringify({ x, y }), {
  //   headers: {
  //     'Content-Type': 'application/json',
  //   },
  // });
  // return response.data;
}
