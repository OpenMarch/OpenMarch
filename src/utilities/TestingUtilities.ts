import { Marcher, Page, MarcherPage } from "@/global/Interfaces";

/**
 * Create marcherPages for each marcher and page for testing purposes.
 *
 * @param marchers
 * @param pages
 * @param defaultX
 * @param defaultY
 * @returns MarcherPage[]
 */
export function createMarcherPages(marchers: Marcher[], pages: Page[], defaultX = 0, defaultY = 0): MarcherPage[] {
    const marcherPages: MarcherPage[] = [];
    let currentId = 1;
    marchers.forEach(marcher => {
        pages.forEach(page => {
            marcherPages.push({
                id: currentId,
                id_for_html: "marcher_page_" + currentId,
                marcher_id: marcher.id,
                page_id: page.id,
                x: defaultX,
                y: defaultY
            });
            currentId++;
        });
    });
    return marcherPages;
}
