import { Marcher } from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import Page from "@/global/classes/Page";

/**
 * Create marcherPages for each marcher and page for testing purposes.
 *
 * @param marchers
 * @param pages
 * @param defaultX
 * @param defaultY
 * @returns MarcherPage[]
 */
export function createMarcherPages(
    marchers: Marcher[],
    pages: Page[],
    defaultX = 0,
    defaultY = 0,
): MarcherPage[] {
    const marcherPages: MarcherPage[] = [];
    let currentId = 1;
    marchers.forEach((marcher) => {
        pages.forEach((page) => {
            marcherPages.push({
                id: currentId,
                id_for_html: "marcher_page_" + currentId,
                marcher_id: marcher.id,
                page_id: page.id,
                x: defaultX,
                y: defaultY,
                path_data_id: null,
                path_start_position: null,
                path_end_position: null,
                path_data: null,
                notes: null,
                pathway_notes: null,
            });
            currentId++;
        });
    });
    return marcherPages;
}
