export const Constants = {
    PageTableName: "pages",
    PagePrefix: "page",
    NewPageId: "NEW_PAGE",

    MarcherTableName: "marchers",
    MarcherPrefix: "marcher",

    MarcherPageTableName: "marcher_pages",
    MarcherPagePrefix: "mp",

    dotRadius: 5
} as const;

/**
 * Assumes that the id_for_html is in the form "page_1" with a single "_" delimiter
 * @param id_for_html "page_1"
 * @returns an integer id "1"
 */
export const idForHtmlToId = (id_for_html: string) => {
    return parseInt(id_for_html.split("_")[1]);
}

export const YARD_LINES = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0] as const;
export const HASHES = ["front sideline", "front hash", "back hash", "back sideline"] as const;
