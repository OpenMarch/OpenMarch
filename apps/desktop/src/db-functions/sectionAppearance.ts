import { eq, inArray } from "drizzle-orm";
import {
    DbConnection,
    DbTransaction,
    transactionWithHistory,
} from "@/db-functions";
import { schema } from "@/global/database/db";
import { RgbaColor } from "@uiw/react-color";
import { rgbaToString } from "@openmarch/core";

/** How a section appearance is represented in the database */
export interface DatabaseSectionAppearance
    extends schema.AppearanceModelParsed {
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

// Parse rgba(0, 0, 0, 1) string color to RGBA color
function parseColor(colorStr: string): RgbaColor {
    // Extract r, g, b, a values from rgba string
    const match = colorStr.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)/,
    );
    if (match) {
        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10),
            a: match[4] ? parseFloat(match[4]) : 1,
        };
    }
    // Default fallback color
    return { r: 0, g: 0, b: 0, a: 1 };
}

export const realDatabaseSectionAppearanceToDatabaseSectionAppearance = (
    item: RealDatabaseSectionAppearance,
): DatabaseSectionAppearance => {
    return {
        ...item,
        fill_color: item.fill_color ? parseColor(item.fill_color) : null,
        outline_color: item.outline_color
            ? parseColor(item.outline_color)
            : null,
    };
};

export interface NewSectionAppearanceArgs {
    section: string;
    fill_color: RgbaColor;
    outline_color: RgbaColor;
    shape_type?: string;
}

interface RealNewSectionAppearanceArgs {
    section: string;
    fill_color: string;
    outline_color: string;
    shape_type: string;
}

const newSectionAppearanceArgsToRealNewSectionAppearanceArgs = (
    args: NewSectionAppearanceArgs,
): RealNewSectionAppearanceArgs => {
    return {
        section: args.section,
        fill_color: rgbaToString(args.fill_color),
        outline_color: rgbaToString(args.outline_color),
        shape_type: args.shape_type || "circle",
    };
};

export interface ModifiedSectionAppearanceArgs {
    id: number;
    section?: string;
    fill_color?: RgbaColor;
    outline_color?: RgbaColor;
    shape_type?: string;
}

interface RealModifiedSectionAppearanceArgs {
    id: number;
    section?: string;
    fill_color?: string;
    outline_color?: string;
    shape_type?: string;
}

const modifiedSectionAppearanceArgsToRealModifiedSectionAppearanceArgs = (
    args: ModifiedSectionAppearanceArgs,
): RealModifiedSectionAppearanceArgs => {
    const result: RealModifiedSectionAppearanceArgs = {
        id: args.id,
    };

    if (args.section !== undefined) {
        result.section = args.section;
    }
    if (args.fill_color !== undefined) {
        result.fill_color = rgbaToString(args.fill_color);
    }
    if (args.outline_color !== undefined) {
        result.outline_color = rgbaToString(args.outline_color);
    }
    if (args.shape_type !== undefined) {
        result.shape_type = args.shape_type;
    }

    return result;
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
        console.log("No new section appearances to create");
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
