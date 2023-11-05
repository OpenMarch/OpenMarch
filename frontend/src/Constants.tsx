export const Constants = {
    PageTableName: "pages",
    PagePrefix: "page",
    NewPageId: "NEW_PAGE",

    MarcherTableName: "marchers",
    MarcherPrefix: "marcher",

    MarcherPageTableName: "marcher_pages",
    MarcherPagePrefix: "mp"
} as const;

/**
 * Assumes that the id_for_html is in the form "page_1" with a single "_" delimiter
 * @param id_for_html "page_1"
 * @returns an integer id "1"
 */
export const idForHtmlToId = (id_for_html: string) => {
    return parseInt(id_for_html.split("_")[1]);
}
