import { asc, gt, eq, lt, desc, and } from "drizzle-orm";
import { DbConnection, DbTransaction } from "./types";
import { schema, db } from "@/global/database/db";
import { updateEndPoint } from "./pathways";
import { transactionWithHistory } from "./history";
import { assert } from "@/utilities/utils";
import {
    createShapePageMarchersInTransaction,
    DatabaseShapePageMarcher,
    deleteShapePageMarchersInTransaction,
    getSpmByMarcherPage,
    getSpmMapAll,
    getSpmMapByPageId,
    NewShapePageMarcherArgs,
    ShapePageMarcher,
    swapPositionOrderInTransaction,
} from "./shapePageMarchers";
import MarcherPage from "@/global/classes/MarcherPage";

const { marcher_pages } = schema;

type MarcherPageIdentifier =
    | {
          marcherId: number;
          pageId: number;
      }
    | { marcherPageId: number };

// Define types from the existing schema - remove pathway fields from base type
export type DatabaseMarcherPage = typeof schema.marcher_pages.$inferSelect;

/**
 * Filters for the marcherPageQueries.getAll function
 */
export type MarcherPageQueryFilters =
    | {
          marcher_id?: number;
          page_id?: number;
      }
    | undefined;

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

async function getMarcherPageByPosition(
    tx: DbTransaction | DbConnection,
    id: MarcherPageIdentifier,
    direction: "next" | "previous",
): Promise<MarcherPage | null> {
    const idCheck = () =>
        "marcherId" in id
            ? eq(schema.marcher_pages.marcher_id, id.marcherId) &&
              eq(schema.marcher_pages.page_id, id.pageId)
            : eq(schema.marcher_pages.id, id.marcherPageId);

    // Subquery: current marcher_id and current beat position
    const cur = await tx
        .select({
            marcherId: schema.marcher_pages.marcher_id,
            curPos: schema.beats.position,
        })
        .from(schema.marcher_pages)
        .innerJoin(
            schema.pages,
            eq(schema.pages.id, schema.marcher_pages.page_id),
        )
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .where(idCheck())
        .limit(1)
        .as("cur");

    if (cur === undefined) {
        return null;
    }

    // Main query: marcher_pages for same marcher where beat.position is greater/less than curPos
    const comparison =
        direction === "next"
            ? gt(schema.beats.position, cur.curPos)
            : lt(schema.beats.position, cur.curPos);

    const ordering =
        direction === "next"
            ? asc(schema.beats.position)
            : desc(schema.beats.position);

    const rows = await tx
        .select({ mp: schema.marcher_pages })
        .from(schema.marcher_pages)
        .innerJoin(
            schema.pages,
            eq(schema.pages.id, schema.marcher_pages.page_id),
        )
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .innerJoin(cur, eq(cur.marcherId, schema.marcher_pages.marcher_id))
        .where(comparison)
        .orderBy(ordering)
        .limit(1);

    const marcherPage = rows[0]?.mp ?? null;
    if (marcherPage == null) return null;

    const key = marcherPageToKeyString(rows[0].mp);
    const spm = await getSpmByMarcherPage({
        tx,
        marcherPage: {
            marcher_id: marcherPage.marcher_id,
            page_id: marcherPage.page_id,
        },
    });
    const map = spm ? new Map([[key, spm]]) : new Map();
    // Ensure the marcher page is decorated with the locked status and locked reason.
    // I.e. give a single entry map with the marcher page and the spm
    return lockedDecorator([marcherPage], map)[0];
}

export async function getNextMarcherPage(
    tx: DbTransaction | DbConnection,
    id: MarcherPageIdentifier,
): Promise<MarcherPage | null> {
    return getMarcherPageByPosition(tx, id, "next");
}

export async function getPreviousMarcherPage(
    tx: DbTransaction | DbConnection,
    id: MarcherPageIdentifier,
): Promise<MarcherPage | null> {
    return getMarcherPageByPosition(tx, id, "previous");
}

export async function updateMarcherPagesInTransaction({
    tx,
    modifiedMarcherPages,
}: {
    tx: DbTransaction;
    modifiedMarcherPages: ModifiedMarcherPageArgs[];
}): Promise<DatabaseMarcherPage[]> {
    const results: DatabaseMarcherPage[] = [];

    for (const modifiedMarcherPage of modifiedMarcherPages) {
        const { marcher_id, page_id, ...updateData } = modifiedMarcherPage;

        const currentMarcherPage = await tx
            .update(marcher_pages)
            .set(updateData)
            .where(
                and(
                    eq(marcher_pages.marcher_id, marcher_id),
                    eq(marcher_pages.page_id, page_id),
                ),
            )
            .returning({
                id: marcher_pages.id,
                marcher_id: marcher_pages.marcher_id,
                page_id: marcher_pages.page_id,
                x: marcher_pages.x,
                y: marcher_pages.y,
                created_at: marcher_pages.created_at,
                updated_at: marcher_pages.updated_at,
                path_data_id: marcher_pages.path_data_id,
                path_start_position: marcher_pages.path_start_position,
                path_end_position: marcher_pages.path_end_position,
                notes: marcher_pages.notes,
                rotation_degrees: marcher_pages.rotation_degrees,
            })
            .get();

        if (currentMarcherPage.path_data_id) {
            await updateEndPoint({
                tx,
                pathwayId: currentMarcherPage.path_data_id,
                newPoint: {
                    x: currentMarcherPage.x,
                    y: currentMarcherPage.y,
                },
                type: "end",
            });
        }

        const nextMarcherPage = await getNextMarcherPage(tx, {
            marcherPageId: currentMarcherPage.id,
        });

        if (nextMarcherPage && nextMarcherPage.path_data_id) {
            await updateEndPoint({
                tx,
                pathwayId: nextMarcherPage.path_data_id,
                newPoint: {
                    x: currentMarcherPage.x,
                    y: currentMarcherPage.y,
                },
                type: "start",
            });
        }

        results.push(currentMarcherPage);
    }

    return results;
}

export async function updateMarcherPages({
    db,
    modifiedMarcherPages,
}: {
    db: DbConnection;
    modifiedMarcherPages: ModifiedMarcherPageArgs[];
}): Promise<DatabaseMarcherPage[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updateMarcherPages",
        async (tx) => {
            return await updateMarcherPagesInTransaction({
                tx,
                modifiedMarcherPages,
            });
        },
    );
    return transactionResult;
}

// eslint-disable-next-line max-lines-per-function
export const _swapSpms = async ({
    tx,
    spm1,
    spm2,
}: {
    tx: DbTransaction;
    spm1: DatabaseShapePageMarcher | null;
    spm2: DatabaseShapePageMarcher | null;
}) => {
    if (spm1 && spm2) {
        // Both SPMs exist. Swap the position order of the SPMs
        if (spm1.shape_page_id === spm2.shape_page_id) {
            const updateSpmsResponse = swapPositionOrderInTransaction({
                tx,
                spmId1: spm1.id,
                spmId2: spm2.id,
            });
            assert(updateSpmsResponse, `Could not update shape page marchers`);
        } else {
            // Swap the shape_page that these SPMs are in
            // Ensure both position_order values are not null
            assert(
                spm1.position_order !== null &&
                    spm1.position_order !== undefined,
                `ShapePageMarcher ${spm1.id} has null or undefined position_order`,
            );
            assert(
                spm2.position_order !== null &&
                    spm2.position_order !== undefined,
                `ShapePageMarcher ${spm2.id} has null or undefined position_order`,
            );

            const deleteSpmsResponse =
                await deleteShapePageMarchersInTransaction({
                    tx,
                    itemIds: new Set([spm1.id, spm2.id]),
                });
            assert(deleteSpmsResponse, `Could not delete shape page marchers`);

            const newSpms: NewShapePageMarcherArgs[] = [
                {
                    marcher_id: spm1.marcher_id,
                    shape_page_id: spm2.shape_page_id,
                    position_order: spm2.position_order,
                    notes: spm2.notes,
                },
                {
                    marcher_id: spm2.marcher_id,
                    shape_page_id: spm1.shape_page_id,
                    position_order: spm1.position_order,
                    notes: spm1.notes,
                },
            ];

            const createSpmsResponse = createShapePageMarchersInTransaction({
                tx,
                newItems: newSpms,
            });
            assert(createSpmsResponse, `Could not create shape page marchers`);
        }
    } else {
        // Only one SPM exists. Delete one of them and create a new one
        const spm = spm1 || spm2;
        assert(spm, `Could not find spm`);
        const marcherPageWithoutSpm = spm1 ? spm2 : spm1;
        assert(
            marcherPageWithoutSpm,
            `Could not find marcher page without spm`,
        );

        // Ensure position_order is not null
        assert(
            spm.position_order !== null && spm.position_order !== undefined,
            `ShapePageMarcher ${spm.id} has null or undefined position_order`,
        );

        const newSpm: NewShapePageMarcherArgs = {
            marcher_id: marcherPageWithoutSpm.marcher_id,
            shape_page_id: spm.shape_page_id,
            position_order: spm.position_order,
            notes: spm.notes,
        };
        const deleteSpmResponse = deleteShapePageMarchersInTransaction({
            tx,
            itemIds: new Set([spm.id]),
        });
        assert(deleteSpmResponse, `Could not delete shape page marchers`);

        const createSpmResponse = createShapePageMarchersInTransaction({
            tx,
            newItems: [newSpm],
        });
        assert(createSpmResponse, `Could not create shape page marchers`);
    }
};

export const swapMarchers = async ({
    db,
    pageId,
    marcher1Id,
    marcher2Id,
}: {
    db: DbConnection;
    pageId: number;
    marcher1Id: number;
    marcher2Id: number;
}) => {
    return await transactionWithHistory(db, "swapMarchers", async (tx) => {
        return await swapMarchersInTransaction({
            tx,
            pageId,
            marcher1Id,
            marcher2Id,
        });
    });
};

export const swapMarchersInTransaction = async ({
    tx,
    pageId,
    marcher1Id,
    marcher2Id,
}: {
    tx: DbTransaction;
    pageId: number;
    marcher1Id: number;
    marcher2Id: number;
}) => {
    const marcherPage1 = await tx.query.marcher_pages.findFirst({
        where: and(
            eq(schema.marcher_pages.page_id, pageId),
            eq(schema.marcher_pages.marcher_id, marcher1Id),
        ),
    });
    assert(
        marcherPage1,
        `Failed to get marcher page for marcher ${marcher1Id} on page ${pageId}`,
    );
    const marcherPage2 = await tx.query.marcher_pages.findFirst({
        where: and(
            eq(schema.marcher_pages.page_id, pageId),
            eq(schema.marcher_pages.marcher_id, marcher2Id),
        ),
    });
    assert(
        marcherPage2,
        `Failed to get marcher page for marcher ${marcher2Id} on page ${pageId}`,
    );

    const spm1 = await getSpmByMarcherPage({
        tx,
        marcherPage: { marcher_id: marcher1Id, page_id: pageId },
    });
    const spm2 = await getSpmByMarcherPage({
        tx,
        marcherPage: { marcher_id: marcher2Id, page_id: pageId },
    });

    // If either of the SPMs exist, we need to update them
    const updateSpms = spm1 || spm2;

    if (updateSpms) {
        await _swapSpms({
            tx,
            spm1,
            spm2,
        });
    }

    const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [
        {
            page_id: pageId,
            marcher_id: marcherPage1.marcher_id,
            x: marcherPage2.x,
            y: marcherPage2.y,
        },
        {
            page_id: pageId,
            marcher_id: marcherPage2.marcher_id,
            x: marcherPage1.x,
            y: marcherPage1.y,
        },
    ];

    const updatedMarcherPages = await updateMarcherPagesInTransaction({
        tx,
        modifiedMarcherPages,
    });

    return updatedMarcherPages;
};

/**
 * Decorates a list of marcher pages with locked status and locked reason.
 *
 * @param marcherPages
 * @param spmsByPageAndMarcher
 * @returns
 */
export const lockedDecorator = (
    marcherPages: DatabaseMarcherPage[],
    spmsByMarcherPage: Map<string, ShapePageMarcher>,
): MarcherPage[] => {
    return marcherPages.map((marcherPage) => {
        let isLocked = false;
        let lockedReason = "";
        const spm = spmsByMarcherPage.get(marcherPageToKeyString(marcherPage));
        if (spm) {
            isLocked = true;
            lockedReason += "Marcher is part of a shape\n";
        }
        return {
            ...marcherPage,
            isLocked,
            lockedReason,
        };
    });
};

/**
 * Converts a marcher page to a key string.
 *
 * E.g. marcher_1-page_2 for marcher 1 on page 2
 *
 * @param marcherPage The marcher page to convert
 * @returns The key string
 */
export const marcherPageToKeyString = (marcherPage: {
    marcher_id: number;
    page_id: number;
}) => {
    return `marcher_${marcherPage.marcher_id}-page_${marcherPage.page_id}`;
};

export const getAllMarcherPages = async ({
    db,
    pinkyPromiseThatYouKnowWhatYouAreDoing = false,
}: {
    db: DbConnection | DbTransaction;
    pinkyPromiseThatYouKnowWhatYouAreDoing?: boolean;
}): Promise<MarcherPage[]> => {
    // No conditions, return all rows
    if (!pinkyPromiseThatYouKnowWhatYouAreDoing)
        console.warn(
            "Returning all marcherPage rows. This should not happen as this fetches all of the coordinates for the entire show. You should probably use getByPage or getByMarcher",
        );
    const marcherPagesResponse = await db
        .select()
        .from(schema.marcher_pages)
        .all();
    const spmsByMarcherPage = await getSpmMapAll({ db });
    return lockedDecorator(marcherPagesResponse, spmsByMarcherPage);
};

export const marcherPagesByPageId = async ({
    db,
    pageId,
}: {
    db: DbConnection | DbTransaction;
    pageId: number;
}): Promise<MarcherPage[]> => {
    const marcherPagesResponse = await db
        .select()
        .from(schema.marcher_pages)
        .where(eq(schema.marcher_pages.page_id, pageId));

    const spmsByMarcherPage = await getSpmMapByPageId({ db, pageId });

    return lockedDecorator(marcherPagesResponse, spmsByMarcherPage);
};

/**
 * Gets all marcher pages by marcher id.
 *
 * NOTE - this does not include the locked status or locked reason
 *
 * @param db The database instance
 * @param marcherId The marcher id
 * @returns
 */
export const marcherPagesByMarcherId = async ({
    db,
    marcherId,
}: {
    db: DbConnection | DbTransaction;
    marcherId: number;
}): Promise<DatabaseMarcherPage[]> => {
    const marcherPagesResponse = await db
        .select()
        .from(schema.marcher_pages)
        .where(eq(schema.marcher_pages.marcher_id, marcherId));
    return marcherPagesResponse;
};
