import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import { and, eq, inArray } from "drizzle-orm";
import { db, DBTransaction, schema } from "../database/db";
import { incrementUndoGroup } from "./History";

const { marcher_pages, shape_page_marchers, shape_pages } = schema;

// Define types from the existing schema
type DatabaseMarcherPage = typeof marcher_pages.$inferSelect;

function createDatabaseMarcherPage(
    args: NewMarcherPageArgs,
): typeof marcher_pages.$inferInsert {
    return {
        ...args,
        notes: args.notes ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
}

/**
 * Arguments for creating a new marcher page
 */
export interface NewMarcherPageArgs {
    marcher_id: number;
    page_id: number;
    x: number;
    y: number;
    notes?: string;
}

/**
 * Arguments for modifying an existing marcher page
 */
export interface ModifiedMarcherPageArgs {
    id: number;
    x?: number;
    y?: number;
    notes?: string;
}

/**
 * A MarcherPage is used to represent a Marcher's position on a Page.
 * MarcherPages can/should not be created or deleted directly, but are created and deleted when a Marcher or Page is.
 * There should be a MarcherPage for every Marcher and Page combination (M * P).
 */
export default class MarcherPage {
    /** The id of the MarcherPage in the database */
    readonly id: number;
    /** The id of the page for use in the HTML. E.g. "marcherPage_2" for MarcherPage with ID of 2 */
    readonly id_for_html: string;
    /** The id of the Marcher the MarcherPage is associated with  */
    readonly marcher_id: number;
    /** The id of the Page the MarcherPage is associated with */
    readonly page_id: number;
    /** X coordinate of the MarcherPage */
    readonly x: number;
    /** Y coordinate of the MarcherPage */
    readonly y: number;
    /** The SVG path of the MarcherPage */
    readonly svg_path?: string | null;
    /** Any notes about the MarcherPage. Optional - currently not implemented */
    readonly notes?: string | null;

    constructor(marcherPage: DatabaseMarcherPage) {
        this.id = marcherPage.id;
        this.id_for_html = `marcherPage_${marcherPage.id}`;
        this.marcher_id = marcherPage.marcher_id;
        this.page_id = marcherPage.page_id;
        this.x = marcherPage.x ?? 0;
        this.y = marcherPage.y ?? 0;
        this.svg_path = marcherPage.svg_path;
        this.notes = marcherPage.notes;
    }

    /**
     * Gets all the MarcherPages that are associated with a given Marcher and/or Page.
     *
     * @param marcher_id - The id of the marcher. Optional
     * @param page_id - The id of the page. Optional
     * @returns A list of all the marcherPages or those for either a given marcher or page.
     */
    static async getMarcherPages({
        marcher_id,
        page_id,
    }: { marcher_id?: number; page_id?: number } = {}): Promise<MarcherPage[]> {
        let queryBuilder = db.select().from(marcher_pages).$dynamic();

        if (marcher_id !== undefined && page_id !== undefined) {
            queryBuilder = queryBuilder.where(
                and(
                    eq(marcher_pages.marcher_id, marcher_id),
                    eq(marcher_pages.page_id, page_id),
                ),
            );
        } else if (marcher_id !== undefined) {
            queryBuilder = queryBuilder.where(
                eq(marcher_pages.marcher_id, marcher_id),
            );
        } else if (page_id !== undefined) {
            queryBuilder = queryBuilder.where(
                eq(marcher_pages.page_id, page_id),
            );
        }

        const results = await queryBuilder.all();
        return results.map((row) => new MarcherPage(row));
    }

    /**
     * Create new marcher pages
     * @param newMarcherPages Array of new marcher page data
     * @returns Promise with array of created MarcherPage objects
     */
    static async createMarcherPages(
        newMarcherPages: NewMarcherPageArgs[],
    ): Promise<MarcherPage[]> {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results = await tx
                .insert(marcher_pages)
                .values(newMarcherPages.map(createDatabaseMarcherPage))
                .returning()
                .all();

            return results.map((row) => new MarcherPage(row));
        });
    }

    /**
     * Update one or many MarcherPages with the provided arguments.
     *
     * @param modifiedMarcherPages - The objects to update the MarcherPages with.
     */
    static async updateMarcherPages(
        modifiedMarcherPages: ModifiedMarcherPageArgs[],
    ): Promise<MarcherPage[]> {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results: DatabaseMarcherPage[] = [];

            for (const modifiedMarcherPage of modifiedMarcherPages) {
                const marcherPageToUpdate =
                    await tx.query.marcher_pages.findFirst({
                        where: eq(marcher_pages.id, modifiedMarcherPage.id),
                    });

                if (!marcherPageToUpdate) continue;

                const locked = await this.isLocked(
                    tx,
                    marcherPageToUpdate.marcher_id,
                    marcherPageToUpdate.page_id,
                );
                if (locked) continue;

                const result = await tx
                    .update(marcher_pages)
                    .set(modifiedMarcherPage)
                    .where(eq(marcher_pages.id, modifiedMarcherPage.id))
                    .returning()
                    .get();
                results.push(result);
            }

            return results.map((row) => new MarcherPage(row));
        });
    }

    /**
     * Delete marcher pages
     * @param marcherPageIds Array of marcher page IDs to delete
     * @returns Promise with array of deleted MarcherPage objects
     */
    static async deleteMarcherPages(
        marcherPageIds: number[],
    ): Promise<MarcherPage[]> {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results = await tx
                .delete(marcher_pages)
                .where(inArray(marcher_pages.id, marcherPageIds))
                .returning()
                .all();

            return results.map((row) => new MarcherPage(row));
        });
    }

    private static async isLocked(
        tx: DBTransaction,
        marcher_id: number,
        page_id: number,
    ): Promise<boolean> {
        const result = await tx
            .select({ id: shape_page_marchers.id })
            .from(shape_page_marchers)
            .innerJoin(
                shape_pages,
                eq(shape_page_marchers.shape_page_id, shape_pages.id),
            )
            .where(
                and(
                    eq(shape_page_marchers.marcher_id, marcher_id),
                    eq(shape_pages.page_id, page_id),
                ),
            )
            .limit(1)
            .get();

        return !!result;
    }

    /**
     * A function to get all MarcherPages that are associated with a given page_id.
     *
     * @param marcherPages All MarcherPages to filter
     * @param page_id The page_id to filter by
     * @returns Array of MarcherPages that have the given page_id
     */
    static getByPageId(
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
    static getByMarcherId(
        marcherPages: MarcherPageMap,
        marcher_id: number,
    ): MarcherPage[] {
        return Object.values(
            marcherPages.marcherPagesByMarcher[marcher_id] || {},
        );
    }

    /**
     * A function to get a single MarcherPage that matches the given marcher_id and page_id.
     *
     * @param marcherPages All MarcherPages to filter
     * @param marcher_id The marcher_id to filter by
     * @param page_id The page_id to filter by
     * @returns The MarcherPage that matches the given marcher_id and page_id, or undefined if not found.
     */
    static getByMarcherAndPageId(
        marcherPages: MarcherPageMap,
        marcher_id: number,
        page_id: number,
    ): MarcherPage | undefined {
        return (
            marcherPages.marcherPagesByMarcher[marcher_id]?.[page_id] ||
            marcherPages.marcherPagesByPage[page_id]?.[marcher_id]
        );
    }
}
