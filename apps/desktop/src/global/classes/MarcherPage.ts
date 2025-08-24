import type { DatabaseResponse } from "electron/database/DatabaseActions";
import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import { schema } from "../database/db";
import { Path, Spline } from "@openmarch/path-utility";
import type Page from "./Page";

const { marcher_pages } = schema;

// Define types from the existing schema
export type DatabaseMarcherPage = typeof marcher_pages.$inferSelect & {
    path_data: string | null;
    pathway_notes: string | null;
};

/**
 * A MarcherPage is used to represent a Marcher's position on a Page.
 * MarcherPages can/should not be created or deleted directly, but are created and deleted when a Marcher or Page is.
 * There should be a MarcherPage for every Marcher and Page combination (M * P).
 */
export default interface MarcherPage {
    /** The id of the MarcherPage in the database */
    readonly id: number;
    /** The id of the page for use in the HTML. E.g. "marcherPage_2" for MarcherPage with ID of 2 */
    readonly id_for_html: string | null;
    /** The id of the Marcher the MarcherPage is associated with  */
    readonly marcher_id: number;
    /** The id of the Page the MarcherPage is associated with */
    readonly page_id: number;
    /** X coordinate of the MarcherPage */
    readonly x: number;
    /** Y coordinate of the MarcherPage */
    readonly y: number;
    /** The ID of the pathway data */
    readonly path_data_id: number | null;
    /**
     * The position along the pathway (0-1).
     * This is the position in the pathway the marcher starts at for this coordinate.
     * If this is null, then it is assumed to be 0 (the start of the pathway).
     */
    readonly path_start_position: number | null;
    /**
     * The position along the pathway (0-1).
     * This is the position in the pathway the marcher ends up at for this coordinate.
     * If this is null, then it is assumed to be 1 (the end of the pathway).
     */
    readonly path_end_position: number | null;
    /**
     * The SVG path data from the pathways table.
     * This is the pathway the marcher uses to get to this marcher page.
     * If this is null, then this is a straight line from the previous marcher page to this one.
     */
    readonly path_data: Path | null;
    /** Any notes about the MarcherPage. Optional - currently not implemented */
    readonly notes: string | null;
    /** The pathway notes from the joined pathways table */
    readonly pathway_notes: string | null;
}

/**
 * Gets all the MarcherPages that are associated with a given Marcher and/or Page.
 * This is a DB query and should not be called other than from the store.
 *
 * NO ARGS - get all MarcherPages.
 * ONE ARG - get all MarcherPages for that Marcher or Page.
 * BOTH ARGS - a single MarcherPage for that specific Marcher and Page.
 *
 * @param marcher_id - The id of the marcher. Optional
 * @param page_id - The id of the page. Optional
 * @returns A list of all the marcherPages or those for either a given marcher or page.
 */
export async function getMarcherPages({
    marcher_id,
    page_id,
    pages,
}: { marcher_id?: number; page_id?: number; pages?: Page[] } = {}): Promise<
    MarcherPage[]
> {
    const response = await window.electron.getMarcherPages({
        marcher_id,
        page_id,
    });
    return databaseMarcherPagesToMarcherPages(response.data, pages);
}

/**
 * Update one or many MarcherPages with the provided arguments.
 *
 * @param modifiedMarcherPages - The objects to update the MarcherPages with.
 * @param fetchMarcherPagesFunction - The function to call to fetch the pages from the database. This function updates the store.
 * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
 */
export async function updateMarcherPages(
    modifiedMarcherPages: ModifiedMarcherPageArgs[],
    fetchMarcherPagesFunction: () => Promise<void>,
): Promise<DatabaseResponse<DatabaseMarcherPage>> {
    const response =
        await window.electron.updateMarcherPages(modifiedMarcherPages);

    // Fetch the MarcherPages to update the store
    if (response.success) await fetchMarcherPagesFunction();
    return response;
}

/**
 * A function to get all MarcherPages that are associated with a given page_id.
 *
 * @param marcherPages All MarcherPages to filter
 * @param page_id The page_id to filter by
 * @returns Array of MarcherPages that have the given page_id
 */
export function getByPageId(
    marcherPages: MarcherPageMap,
    page_id: number,
): MarcherPage[] {
    return Object.values(marcherPages.marcherPagesByPage[page_id] || {});
}

/**
 * A function to get all MarcherPages that are associated with a given marcher_id.
 *
 * @param marcherPages All MarcherPages to filter
 * @param marcher_id The marcher_id to filter by
 * @returns Array of MarcherPages that have the given marcher_id
 */
export function getByMarcherId(
    marcherPages: MarcherPageMap,
    marcher_id: number,
): MarcherPage[] {
    return Object.values(marcherPages.marcherPagesByMarcher[marcher_id] || {});
}

/**
 * A function to get a single MarcherPage that matches the given marcher_id and page_id.
 *
 * @param marcherPages All MarcherPages to filter
 * @param marcher_id The marcher_id to filter by
 * @param page_id The page_id to filter by
 * @returns The MarcherPage that matches the given marcher_id and page_id, or undefined if not found.
 */
export function getByMarcherAndPageId(
    marcherPages: MarcherPageMap,
    marcher_id: number,
    page_id: number,
): MarcherPage | undefined {
    return (
        marcherPages.marcherPagesByMarcher[marcher_id]?.[page_id] ||
        marcherPages.marcherPagesByPage[page_id]?.[marcher_id]
    );
}

export function databaseMarcherPagesToMarcherPages(
    databaseMarcherPages: DatabaseMarcherPage[],
    pages?: Page[],
): MarcherPage[] {
    // If no pages data provided, use array index as order
    const pageOrderMap = pages?.length
        ? new Map(pages.map((page) => [page.id, page.order]))
        : null;

    // Group marcher pages by marcher_id
    const marcherPagesByMarcher = new Map<number, DatabaseMarcherPage[]>();
    databaseMarcherPages.forEach((marcherPage) => {
        const marcherId = marcherPage.marcher_id;
        if (!marcherPagesByMarcher.has(marcherId)) {
            marcherPagesByMarcher.set(marcherId, []);
        }
        marcherPagesByMarcher.get(marcherId)!.push(marcherPage);
    });

    // Convert each marcher's pages
    const result: MarcherPage[] = [];

    marcherPagesByMarcher.forEach((marcherPages, marcherId) => {
        // Sort by page order if available, otherwise by array index
        const sortedMarcherPages = pageOrderMap
            ? marcherPages.sort((a, b) => {
                  const aOrder = pageOrderMap.get(a.page_id) ?? 0;
                  const bOrder = pageOrderMap.get(b.page_id) ?? 0;
                  return aOrder - bOrder;
              })
            : marcherPages;

        // Convert each marcher page with path data
        sortedMarcherPages.forEach((dbMarcherPage, index) => {
            const previousMarcherPage =
                index > 0 ? sortedMarcherPages[index - 1] : null;

            result.push({
                ...dbMarcherPage,
                path_data: createPathData(dbMarcherPage, previousMarcherPage),
                x: dbMarcherPage.x || 0,
                y: dbMarcherPage.y || 0,
            });
        });
    });

    return result;
}

/**
 * Creates path data from a marcher page, using the previous marcher page as the start point
 */
function createPathData(
    currentMarcherPage: DatabaseMarcherPage,
    previousMarcherPage: DatabaseMarcherPage | null,
): Path | null {
    if (!currentMarcherPage.path_data || !previousMarcherPage) {
        return null;
    }

    return Path.fromJson(
        currentMarcherPage.path_data,
        { x: previousMarcherPage.x, y: previousMarcherPage.y },
        { x: currentMarcherPage.x, y: currentMarcherPage.y },
    );
}

/**
 * Defines the editable fields of a MarcherPage.
 * `marcher_id` and `page_id` are used to identify the marcherPage and cannot be changed.
 */
export interface ModifiedMarcherPageArgs {
    marcher_id: number;
    page_id: number;
    /** The new X coordinate of the MarcherPage */
    x: number;
    /** The new Y coordinate of the MarcherPage */
    y: number;
    notes?: string | null;
    /** The ID of the pathway data */
    path_data_id?: number | null;
    /** The position along the pathway (0-1) */
    path_start_position?: number | null;
    path_end_position?: number | null;
}

export const marcherPagesToPath = ({
    startMarcherPage,
    endMarcherPage,
}: {
    startMarcherPage: MarcherPage;
    endMarcherPage: MarcherPage;
}): Path => {
    if (!endMarcherPage.path_data) {
        return new Path([
            new Spline([
                { x: startMarcherPage.x, y: startMarcherPage.y },
                {
                    x: (startMarcherPage.x + endMarcherPage.x) / 2,
                    y: (startMarcherPage.y + endMarcherPage.y) / 2,
                },
                { x: endMarcherPage.x, y: endMarcherPage.y },
            ]),
        ]);
    }

    return endMarcherPage.path_data;
};
