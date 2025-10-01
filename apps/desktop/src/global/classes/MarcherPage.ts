import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import { schema } from "../database/db";
import type Page from "./Page";
import { DbConnection, DbTransaction } from "@/db-functions/types";

const { marcher_pages } = schema;

// Define types from the existing schema
export type DatabaseMarcherPageBase = typeof marcher_pages.$inferSelect;
export type DatabaseMarcherPage = DatabaseMarcherPageBase;

/**
 * A MarcherPage is used to represent a Marcher's position on a Page.
 * MarcherPages can/should not be created or deleted directly, but are created and deleted when a Marcher or Page is.
 * There should be a MarcherPage for every Marcher and Page combination (M * P).
 */
export default interface MarcherPage extends DatabaseMarcherPageBase {
    readonly isLocked?: boolean;
    readonly lockedReason?: string;
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
    return databaseMarcherPages;
}

// export const marcherPagesToPath = ({
//     startMarcherPage,
//     endMarcherPage,
// }: {
//     startMarcherPage: MarcherPage;
//     endMarcherPage: MarcherPage;
// }): Path => {
//     if (!endMarcherPage.path_data_id) {
//         return new Path([
//             new Spline([
//                 { x: startMarcherPage.x, y: startMarcherPage.y },
//                 {
//                     x: (startMarcherPage.x + endMarcherPage.x) / 2,
//                     y: (startMarcherPage.y + endMarcherPage.y) / 2,
//                 },
//                 { x: endMarcherPage.x, y: endMarcherPage.y },
//             ]),
//         ]);
//     }
//     return endMarcherPage.path_data;
// };
