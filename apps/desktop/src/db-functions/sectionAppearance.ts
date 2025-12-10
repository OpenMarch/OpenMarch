import { eq, inArray } from "drizzle-orm";
import {
    DbConnection,
    DbTransaction,
    transactionWithHistory,
} from "@/db-functions";
import { schema } from "@/global/database/db";
import {
    AppearanceComponent,
    AppearanceComponentOptional,
    appearanceModelParsedToRawOptional,
    AppearanceComponentRawOptional,
    appearanceModelRawToParsed,
} from "@/entity-components/appearance";

/** How a section appearance is represented in the database */
export interface DatabaseSectionAppearance extends AppearanceComponent {
    id: number;
    section: string;
    created_at: string;
    updated_at: string;
}
export type SectionAppearance = DatabaseSectionAppearance;

// Only do this if it's needed to convert the real database values to something else
// I.e. integer -> boolean in sqlite
type RealDatabaseSectionAppearance =
    typeof schema.section_appearances.$inferSelect;

export const realDatabaseSectionAppearanceToDatabaseSectionAppearance = (
    item: RealDatabaseSectionAppearance,
): DatabaseSectionAppearance => {
    return {
        ...item,
        ...appearanceModelRawToParsed(item),
    };
};

export interface NewSectionAppearanceArgs extends AppearanceComponentOptional {
    section: string;
}

interface RealNewSectionAppearanceArgs extends AppearanceComponentRawOptional {
    section: string;
}

const newSectionAppearanceArgsToRealNewSectionAppearanceArgs = (
    args: NewSectionAppearanceArgs,
): RealNewSectionAppearanceArgs => {
    return {
        section: args.section,
        ...appearanceModelParsedToRawOptional({
            ...args,
            visible: true,
            label_visible: true,
        }),
    };
};

export interface ModifiedSectionAppearanceArgs
    extends AppearanceComponentOptional {
    id: number;
    section?: string;
}

interface RealModifiedSectionAppearanceArgs
    extends AppearanceComponentRawOptional {
    id: number;
    section?: string;
}

const modifiedSectionAppearanceArgsToRealModifiedSectionAppearanceArgs = (
    args: ModifiedSectionAppearanceArgs,
): RealModifiedSectionAppearanceArgs => {
    return {
        id: args.id,
        section: args.section,
        ...appearanceModelParsedToRawOptional({
            ...args,
        }),
    };
};

/**
 * Gets all section appearances from the database.
 */
export async function getSectionAppearances({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseSectionAppearance[]> {
    const result = await db.query.section_appearances.findMany();
    return result.map(realDatabaseSectionAppearanceToDatabaseSectionAppearance);
}

/**
 * Gets a single section appearance by ID.
 */
export async function getSectionAppearanceById({
    db,
    id,
}: {
    db: DbConnection;
    id: number;
}): Promise<DatabaseSectionAppearance | undefined> {
    const result = await db.query.section_appearances.findFirst({
        where: eq(schema.section_appearances.id, id),
    });
    return result
        ? realDatabaseSectionAppearanceToDatabaseSectionAppearance(result)
        : undefined;
}

/**
 * Gets section appearances by section name.
 */
export async function getSectionAppearancesBySection({
    db,
    section,
}: {
    db: DbConnection;
    section: string;
}): Promise<DatabaseSectionAppearance[]> {
    const result = await db.query.section_appearances.findMany({
        where: eq(schema.section_appearances.section, section),
    });
    return result.map(realDatabaseSectionAppearanceToDatabaseSectionAppearance);
}

/**
 * Creates new section appearances in the database.
 */
export async function createSectionAppearances({
    newItems,
    db,
}: {
    newItems: NewSectionAppearanceArgs[];
    db: DbConnection;
}): Promise<DatabaseSectionAppearance[]> {
    if (newItems.length === 0) {
        console.debug("No new section appearances to create");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createSectionAppearances",
        async (tx) => {
            return await createSectionAppearancesInTransaction({
                newItems,
                tx,
            });
        },
    );
    return transactionResult;
}

const createSectionAppearancesInTransaction = async ({
    newItems,
    tx,
}: {
    newItems: NewSectionAppearanceArgs[];
    tx: DbTransaction;
}): Promise<DatabaseSectionAppearance[]> => {
    const createdItems = await tx
        .insert(schema.section_appearances)
        .values(
            newItems.map(
                newSectionAppearanceArgsToRealNewSectionAppearanceArgs,
            ),
        )
        .returning();

    return createdItems.map(
        realDatabaseSectionAppearanceToDatabaseSectionAppearance,
    );
};

/**
 * Updates existing section appearances in the database.
 */
export async function updateSectionAppearances({
    db,
    modifiedItems,
}: {
    db: DbConnection;
    modifiedItems: ModifiedSectionAppearanceArgs[];
}): Promise<DatabaseSectionAppearance[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updateSectionAppearances",
        async (tx) => {
            return await updateSectionAppearancesInTransaction({
                modifiedItems,
                tx,
            });
        },
    );
    return transactionResult;
}

export const updateSectionAppearancesInTransaction = async ({
    modifiedItems,
    tx,
}: {
    modifiedItems: ModifiedSectionAppearanceArgs[];
    tx: DbTransaction;
}): Promise<DatabaseSectionAppearance[]> => {
    const updatedItems: DatabaseSectionAppearance[] = [];
    const realModifiedItems = modifiedItems.map(
        modifiedSectionAppearanceArgsToRealModifiedSectionAppearanceArgs,
    );

    for (const modifiedItem of realModifiedItems) {
        const { id, ...updateData } = modifiedItem;
        const updatedItem = await tx
            .update(schema.section_appearances)
            .set(updateData)
            .where(eq(schema.section_appearances.id, id))
            .returning()
            .get();
        updatedItems.push(
            realDatabaseSectionAppearanceToDatabaseSectionAppearance(
                updatedItem,
            ),
        );
    }

    return updatedItems;
};

/**
 * Deletes section appearances from the database.
 */
export async function deleteSectionAppearances({
    itemIds,
    db,
}: {
    itemIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseSectionAppearance[]> {
    if (itemIds.size === 0) return [];

    const response = await transactionWithHistory(
        db,
        "deleteSectionAppearances",
        async (tx) => {
            return await deleteSectionAppearancesInTransaction({
                itemIds,
                tx,
            });
        },
    );
    return response;
}

const deleteSectionAppearancesInTransaction = async ({
    itemIds,
    tx,
}: {
    itemIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseSectionAppearance[]> => {
    const deletedItems = await tx
        .delete(schema.section_appearances)
        .where(inArray(schema.section_appearances.id, Array.from(itemIds)))
        .returning();

    return deletedItems.map(
        realDatabaseSectionAppearanceToDatabaseSectionAppearance,
    );
};
