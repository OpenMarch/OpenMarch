import axios from 'axios';
import { InterfaceConst } from '../Interfaces';

const m_table = InterfaceConst.MarcherTableName;
const p_table = InterfaceConst.PageTableName;

const API_URL = 'http://localhost:3001/api/v1';

export async function getPages() {
  const response = await axios.get(API_URL + '/pages');
  // console.log(response.data);
  return response.data;
}

export async function getMarchers() {
  const response = await axios.get(API_URL + '/marchers');
  return response.data;
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
  const response = await axios.get(API_URL + `/${m_table}/${marcher_id}/${p_table}/${page_id}/marcher_pages`);
  return response.data;
}

/**
 * Pass no arguments to get all marcherPages.
 * Use id_for_html, not id. This is for integrated type checking.
 *
 * @param {string} id_for_html - obj.id_for_html: the id_for_html of the marcher or page.
 * @returns A list of all the marcherPages or those for either a given marcher or page.
 */
export async function getMarcherPages(id_for_html: string | void) {
  var arg_string = '';

  if (id_for_html) {
    // Trim the "marcher_" or "page_" prefix off the html id
    const id = id_for_html.substring(id_for_html.indexOf('_') + 1);
    if (id_for_html.includes('marcher'))
      arg_string = `/${m_table}/${id}`;
    else if (id_for_html.includes('page'))
      arg_string = `/${p_table}/${id}`;
  }

  const response = await axios.get(API_URL + arg_string + '/marcher_pages');
  return response.data;
}

// export async function createPage(page) {
//   const response = await axios.post(API_URL + '/pages', page);
//   return response.data;
// }

// export async function updateMarcher(id, marcher) {
//   const response = await axios.patch(API_URL + `/marchers/${id}`, marcher);
//   return response.data;
// }

// etc...
