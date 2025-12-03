import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import { schema } from "../database/db";
import {
    AppearanceModel,
    appearanceModelRawToParsed,
} from "@/entity-components/appearance";

const { marcher_pages } = schema;

// Define types from the existing schema
export type DatabaseMarcherPage = typeof marcher_pages.$inferSelect;

/**
 * A MarcherPage is used to represent a Marcher's position on a Page.
 * MarcherPages can/should not be created or deleted directly, but are created and deleted when a Marcher or Page is.
 * There should be a MarcherPage for every Marcher and Page combination (M * P).
 */
export default interface MarcherPage extends AppearanceModel {
    readonly id: number;
    readonly isLocked?: boolean;
    readonly lockedReason?: string;
    readonly marcher_id: number;
    readonly page_id: number;
    readonly x: number;
    readonly y: number;
    readonly notes: string | null;
    readonly path_data_id: number | null;
    readonly path_start_position: number | null;
    readonly path_end_position: number | null;
    readonly rotation_degrees: number;
    readonly created_at: string;
    readonly updated_at: string;
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
): MarcherPage[] {
    return databaseMarcherPages.map((databaseMarcherPage) => ({
        ...databaseMarcherPage,
        ...appearanceModelRawToParsed(databaseMarcherPage),
    }));
}
