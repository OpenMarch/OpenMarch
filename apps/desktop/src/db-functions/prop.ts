import { eq, inArray } from "drizzle-orm";
import { DbConnection, DbTransaction } from "./types";
import { schema } from "@/global/database/db";
import { transactionWithHistory } from "./history";

type DatabaseProp = typeof schema.props.$inferSelect;
export type Prop = DatabaseProp;
/**
 * Defines the required/available fields of a new prop.
 */
export interface NewPropArgs {
    type: string;
    field_label?: string | null;
    notes?: string | null;
}

/**
 * Defines the editable fields of a prop.
 */
export interface ModifiedPropArgs {
    /**
     * The id of the prop to update.
     */
    id: number;
    type?: string;
    field_label?: string | null;
    notes?: string | null;
}

/**
 * @param db The database connection
 * @returns An array of all props in the database
 */
export async function getProps({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseProp[]> {
    const response = await db.select().from(schema.props);
    return response;
}

/**
 * Gets a single prop by ID.
 */
export async function getPropById({
    db,
    id,
}: {
    db: DbConnection;
    id: number;
}): Promise<DatabaseProp | undefined> {
    const result = await db.query.props.findFirst({
        where: eq(schema.props.id, id),
    });
    return result;
}

export async function createPropsInTransaction({
    newProps,
    tx,
}: {
    newProps: NewPropArgs[];
    tx: DbTransaction;
}): Promise<DatabaseProp[]> {
    if (newProps.length === 0) {
        return [];
    }

    const createdProps = await tx
        .insert(schema.props)
        .values(newProps)
        .returning();

    if (!createdProps) {
        throw new Error("Failed to create props");
    }

    // Create a prop_page for each prop and page
    const allPages = await tx.query.pages.findMany();

    // Create a prop_page for each prop
    const newPropPages: {
        prop_id: number;
        page_id: number;
        x: number;
        y: number;
        relative_points: string;
        originX?: string;
        originY?: string;
        notes?: string | null;
    }[] = [];

    // Default position: center of the field (0, 0)
    const defaultX = 0;
    const defaultY = 0;
    const defaultRelativePoints = JSON.stringify([]);

    for (const page of allPages) {
        for (const prop of createdProps) {
            newPropPages.push({
                prop_id: prop.id,
                page_id: page.id,
                x: defaultX,
                y: defaultY,
                relative_points: defaultRelativePoints,
                originX: "center",
                originY: "center",
            });
        }
    }

    const propPagePromises: Promise<unknown>[] = [];
    for (const propPage of newPropPages) {
        propPagePromises.push(tx.insert(schema.prop_pages).values(propPage));
    }
    await Promise.all(propPagePromises);

    return createdProps;
}

/**
 * Creates a list of props with the given values.
 *
 * THIS SHOULD ALWAYS BE CALLED RATHER THAN 'db.insert' DIRECTLY.
 *
 * @param newProps Array of NewPropArgs containing the prop data to create
 * @param db The database connection
 * @returns Promise<DatabaseProp[]> Array of created props
 */
export async function createProps({
    newProps,
    db,
}: {
    newProps: NewPropArgs[];
    db: DbConnection;
}): Promise<DatabaseProp[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "createProps",
        async (tx) => {
            return await createPropsInTransaction({
                newProps,
                tx,
            });
        },
    );
    return transactionResult;
}

const updatePropsInTransaction = async ({
    modifiedProps,
    tx,
}: {
    modifiedProps: ModifiedPropArgs[];
    tx: DbTransaction;
}): Promise<DatabaseProp[]> => {
    const updatedProps: DatabaseProp[] = [];
    for (const modifiedProp of modifiedProps) {
        const { id, ...updateData } = modifiedProp;
        const updatedProp = await tx
            .update(schema.props)
            .set(updateData)
            .where(eq(schema.props.id, id))
            .returning()
            .get();
        updatedProps.push(updatedProp);
    }
    return updatedProps;
};

/**
 * Update a list of props with the given values.
 *
 * @param modifiedProps Array of ModifiedPropArgs that contain the id of the
 *                      prop to update and the values to update it with
 * @param db The database connection
 * @returns Promise<DatabaseProp[]> Array of updated props
 */
export async function updateProps({
    modifiedProps,
    db,
}: {
    modifiedProps: ModifiedPropArgs[];
    db: DbConnection;
}): Promise<DatabaseProp[]> {
    const updateResponse = await transactionWithHistory(
        db,
        "updateProps",
        async (tx) => {
            return await updatePropsInTransaction({
                modifiedProps,
                tx,
            });
        },
    );
    return updateResponse;
}

const deletePropsInTransaction = async ({
    propIds,
    tx,
}: {
    propIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseProp[]> => {
    if (propIds.size === 0) return [];

    const deletedProps = await tx
        .delete(schema.props)
        .where(inArray(schema.props.id, Array.from(propIds)))
        .returning();

    return deletedProps;
};

/**
 * Deletes the props with the given ids and all of their prop_pages.
 * CAUTION - This will also delete all of the prop_pages associated with the props.
 *
 * @param propIds Set of prop IDs to delete
 * @param db The database connection
 * @returns Promise<DatabaseProp[]> Array of deleted props
 */
export async function deleteProps({
    propIds,
    db,
}: {
    propIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseProp[]> {
    const deleteResponse = await transactionWithHistory(
        db,
        "deleteProps",
        async (tx) => {
            return await deletePropsInTransaction({
                propIds,
                tx,
            });
        },
    );
    return deleteResponse;
}
