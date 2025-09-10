import { FieldProperties } from "@openmarch/core";
import { eq } from "drizzle-orm";
import { DbConnection, DbTransaction } from "./types";
import { schema } from "@/global/database/db";
import { ModifiedMarcherPageArgs } from "@/hooks/queries";
import { transactionWithHistory } from "./history";

type DatabaseMarcher = typeof schema.marchers.$inferSelect;

/**
 * Defines the required/available fields of a new marcher.
 */
export interface NewMarcherArgs {
    name?: string | null;
    section: string;
    drill_prefix: string;
    drill_order: number;
    year?: string | null;
    notes?: string | null;
}

/**
 * Defines the editable fields of a marcher.
 */
export interface ModifiedMarcherArgs {
    /**
     * The id of the marcher to update.
     */
    id: number;
    name?: string | null;
    section?: string;
    drill_prefix?: string;
    drill_order?: number;
    year?: string | null;
    notes?: string | null;
}

type StartingData = {
    point: {
        x: number;
        y: number;
    };
    spacing: number;
};

const DEFAULT_STARTING_DATA: StartingData = {
    point: {
        x: 100,
        y: 100,
    },
    spacing: 25,
};

const calculateStartingData = async (
    tx: DbTransaction,
    currentPageId: number | null,
): Promise<StartingData> => {
    const fieldPropertiesResult = await tx.query.field_properties.findFirst();
    if (!fieldPropertiesResult) {
        console.warn(
            "Field properties not found, using default starting point",
        );
        return DEFAULT_STARTING_DATA;
    }
    const fieldProperties = new FieldProperties(
        JSON.parse(fieldPropertiesResult.json_data),
    );
    const pixelsPerStep = fieldProperties.pixelsPerStep;
    const stepInterval = 2;
    const intervalInPixels = stepInterval * pixelsPerStep;

    // start 4 steps in front of and inside the top left corner of the field
    let startingPoint = {
        x: intervalInPixels * 4,
        y: intervalInPixels * 4,
    };

    if (!currentPageId) {
        return {
            point: startingPoint,
            spacing: stepInterval,
        };
    }

    const getExistingMarcherPageWithCoordinates = async (startingPoint: {
        x: number;
        y: number;
    }) =>
        await tx.query.marcher_pages.findFirst({
            where: (table, { and, eq }) =>
                and(
                    eq(table.page_id, currentPageId),
                    eq(table.x, startingPoint.x),
                    eq(table.y, startingPoint.y),
                ),
            columns: {
                id: true,
            },
        });
    let existingMarcherPageWithCoordinates =
        await getExistingMarcherPageWithCoordinates(startingPoint);
    while (existingMarcherPageWithCoordinates) {
        startingPoint.y += intervalInPixels;
        existingMarcherPageWithCoordinates =
            await getExistingMarcherPageWithCoordinates(startingPoint);
    }

    return {
        point: startingPoint,
        spacing: stepInterval,
    };
};

/**
 * @param db The database connection, or undefined to create a new connection
 * @returns An array of all marchers in the database
 */
export async function getMarchers({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseMarcher[]> {
    const response = await db.select().from(schema.marchers);
    return response;
}

export async function createMarchersInTransaction({
    newMarchers,
    tx,
}: {
    newMarchers: NewMarcherArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMarcher[]> {
    if (newMarchers.length === 0) {
        return [];
    }

    const createdMarchers = await tx
        .insert(schema.marchers)
        .values(newMarchers)
        .returning();

    if (!createdMarchers) {
        throw new Error("Failed to create marchers");
    }

    // Create a marcherPage for each marcher and page
    const allPages = await tx.query.pages.findMany();

    // Create a marcherPage for each marcher
    const newMarcherPages: ModifiedMarcherPageArgs[] = [];

    for (const page of allPages) {
        const startingData = await calculateStartingData(tx, page.id);
        for (const [index, marcher] of createdMarchers.entries()) {
            newMarcherPages.push({
                marcher_id: marcher.id,
                page_id: page.id,
                x: startingData.point.x + index * startingData.spacing,
                y: startingData.point.y,
            });
        }
    }
    const marcherPagePromises: Promise<unknown>[] = [];
    for (const marcherPage of newMarcherPages) {
        marcherPagePromises.push(
            tx.insert(schema.marcher_pages).values(marcherPage),
        );
    }
    Promise.all(marcherPagePromises);

    return createdMarchers;
}

/**
 * Creates a list of marchers with the given values.
 *
 * @param newMarchers Array of NewMarcherArgs containing the marcher data to create
 * @param db The database connection
 * @returns Promise<DatabaseMarcher[]> Array of created marchers
 */
export async function createMarchers({
    newMarchers,
    db,
}: {
    newMarchers: NewMarcherArgs[];
    db: DbConnection;
}): Promise<DatabaseMarcher[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "createMarchers",
        async (tx) => {
            return await createMarchersInTransaction({
                newMarchers,
                tx,
            });
        },
    );
    return transactionResult;
}

const updateMarchersInTransaction = async ({
    modifiedMarchers,
    tx,
}: {
    modifiedMarchers: ModifiedMarcherArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMarcher[]> => {
    const updatedMarchers: DatabaseMarcher[] = [];
    for (const modifiedMarcher of modifiedMarchers) {
        const { id, ...updateData } = modifiedMarcher;
        const updatedMarcher = await tx
            .update(schema.marchers)
            .set(updateData)
            .where(eq(schema.marchers.id, id))
            .returning()
            .get();
        updatedMarchers.push(updatedMarcher);
    }
    return updatedMarchers;
};

/**
 * Update a list of marchers with the given values.
 *
 * @param modifiedMarchers Array of ModifiedMarcherArgs that contain the id of the
 *                    marcher to update and the values to update it with
 * @param db The database connection
 * @returns Promise<DatabaseMarcher[]> Array of updated marchers
 */
export async function updateMarchers({
    modifiedMarchers,
    db,
}: {
    modifiedMarchers: ModifiedMarcherArgs[];
    db: DbConnection;
}): Promise<DatabaseMarcher[]> {
    const updateResponse = await transactionWithHistory(
        db,
        "updateMarchers",
        async (tx) => {
            return await updateMarchersInTransaction({
                modifiedMarchers,
                tx,
            });
        },
    );
    return updateResponse;
}

const deleteMarchersInTransaction = async ({
    marcherIds,
    tx,
}: {
    marcherIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseMarcher[]> => {
    const deletedMarchers: DatabaseMarcher[] = [];
    for (const marcherId of marcherIds) {
        const deletedMarcher = await tx
            .delete(schema.marchers)
            .where(eq(schema.marchers.id, marcherId))
            .returning()
            .get();
        if (deletedMarcher) deletedMarchers.push(deletedMarcher);
        else
            console.warn(
                `Marcher with id ${marcherId} not found. Ignoring deletion`,
            );
    }
    return deletedMarchers;
};

/**
 * Deletes the marchers with the given ids and all of their marcherPages.
 * CAUTION - This will also delete all of the marcherPages associated with the marchers.
 *
 * @param marcherIds Set of marcher IDs to delete
 * @param db The database connection
 * @returns Promise<DatabaseMarcher[]> Array of deleted marchers
 */
export async function deleteMarchers({
    marcherIds,
    db,
}: {
    marcherIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseMarcher[]> {
    const deleteResponse = await transactionWithHistory(
        db,
        "deleteMarchers",
        async (tx) => {
            return await deleteMarchersInTransaction({
                marcherIds,
                tx,
            });
        },
    );
    return deleteResponse;
}
