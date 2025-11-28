import { eq, inArray } from "drizzle-orm";
import {
    DbConnection,
    DbTransaction,
    transactionWithHistory,
} from "@/db-functions";
import { schema } from "@/global/database/db";
import { RgbaColor } from "@uiw/react-color";
import { rgbaToString } from "@openmarch/core";

// ============================================================================
// TAGS
// ============================================================================

/** How a tag is represented in the database */
export type DatabaseTag = typeof schema.tags.$inferSelect;

export interface NewTagArgs {
    name?: string | null;
    description?: string | null;
}

export interface ModifiedTagArgs {
    id: number;
    name?: string | null;
    description?: string | null;
}

/**
 * Gets all tags from the database.
 */
export async function getTags({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseTag[]> {
    const result = await db.query.tags.findMany();
    return result;
}

/**
 * Gets a single tag by ID.
 */
export async function getTagById({
    db,
    id,
}: {
    db: DbConnection;
    id: number;
}): Promise<DatabaseTag | undefined> {
    const result = await db.query.tags.findFirst({
        where: eq(schema.tags.id, id),
    });
    return result;
}

/**
 * Creates new tags in the database.
 */
export async function createTags({
    newTags,
    db,
}: {
    newTags: NewTagArgs[];
    db: DbConnection;
}): Promise<DatabaseTag[]> {
    if (newTags.length === 0) {
        console.log("No new tags to create");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createTags",
        async (tx) => {
            return await createTagsInTransaction({
                newTags,
                tx,
            });
        },
    );
    return transactionResult;
}

const createTagsInTransaction = async ({
    newTags,
    tx,
}: {
    newTags: NewTagArgs[];
    tx: DbTransaction;
}): Promise<DatabaseTag[]> => {
    const createdTags = await tx
        .insert(schema.tags)
        .values(newTags)
        .returning();

    return createdTags;
};

/**
 * Updates existing tags in the database.
 */
export async function updateTags({
    db,
    modifiedTags,
}: {
    db: DbConnection;
    modifiedTags: ModifiedTagArgs[];
}): Promise<DatabaseTag[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updateTags",
        async (tx) => {
            return await updateTagsInTransaction({
                modifiedTags,
                tx,
            });
        },
    );
    return transactionResult;
}

export const updateTagsInTransaction = async ({
    modifiedTags,
    tx,
}: {
    modifiedTags: ModifiedTagArgs[];
    tx: DbTransaction;
}): Promise<DatabaseTag[]> => {
    const updatedTags: DatabaseTag[] = [];

    for (const modifiedTag of modifiedTags) {
        const { id, ...updateData } = modifiedTag;
        const updatedTag = await tx
            .update(schema.tags)
            .set(updateData)
            .where(eq(schema.tags.id, id))
            .returning()
            .get();
        updatedTags.push(updatedTag);
    }

    return updatedTags;
};

/**
 * Deletes tags from the database.
 * CAUTION - This will cascade delete all tag_appearances and marcher_tags associated with these tags.
 */
export async function deleteTags({
    tagIds,
    db,
}: {
    tagIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseTag[]> {
    if (tagIds.size === 0) return [];

    const response = await transactionWithHistory(
        db,
        "deleteTags",
        async (tx) => {
            return await deleteTagsInTransaction({
                tagIds,
                tx,
            });
        },
    );
    return response;
}

const deleteTagsInTransaction = async ({
    tagIds,
    tx,
}: {
    tagIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseTag[]> => {
    const deletedTags = await tx
        .delete(schema.tags)
        .where(inArray(schema.tags.id, Array.from(tagIds)))
        .returning();

    return deletedTags;
};

// ============================================================================
// TAG APPEARANCES
// ============================================================================

/** How a tag appearance is represented in the database */
export interface DatabaseTagAppearance {
    id: number;
    tag_id: number;
    start_page_id: number;
    fill_color: RgbaColor;
    outline_color: RgbaColor;
    shape_type: string;
    visible: boolean;
    label_visible: boolean;
    priority: number;
    created_at: string;
    updated_at: string;
}

type RealDatabaseTagAppearance = typeof schema.tag_appearances.$inferSelect;

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

export const realDatabaseTagAppearanceToDatabaseTagAppearance = (
    item: RealDatabaseTagAppearance,
): DatabaseTagAppearance => {
    return {
        id: item.id,
        tag_id: item.tag_id,
        start_page_id: item.start_page_id,
        fill_color: parseColor(item.fill_color),
        outline_color: parseColor(item.outline_color),
        shape_type: item.shape_type,
        visible: item.visible === 1,
        label_visible: item.label_visible === 1,
        priority: item.priority,
        created_at: item.created_at,
        updated_at: item.updated_at,
    };
};

export interface NewTagAppearanceArgs {
    tag_id: number;
    start_page_id: number;
    fill_color?: RgbaColor;
    outline_color?: RgbaColor;
    shape_type?: string;
    visible?: boolean;
    label_visible?: boolean;
    priority?: number;
}

interface RealNewTagAppearanceArgs {
    tag_id: number;
    start_page_id: number;
    fill_color?: string;
    outline_color?: string;
    shape_type?: string;
    visible?: number;
    label_visible?: number;
    priority?: number;
}

const newTagAppearanceArgsToRealNewTagAppearanceArgs = (
    args: NewTagAppearanceArgs,
): RealNewTagAppearanceArgs => {
    const result: RealNewTagAppearanceArgs = {
        tag_id: args.tag_id,
        start_page_id: args.start_page_id,
    };

    if (args.fill_color !== undefined) {
        result.fill_color = rgbaToString(args.fill_color);
    }
    if (args.outline_color !== undefined) {
        result.outline_color = rgbaToString(args.outline_color);
    }
    if (args.shape_type !== undefined) {
        result.shape_type = args.shape_type;
    }
    if (args.visible !== undefined) {
        result.visible = args.visible ? 1 : 0;
    }
    if (args.label_visible !== undefined) {
        result.label_visible = args.label_visible ? 1 : 0;
    }
    if (args.priority !== undefined) {
        result.priority = args.priority;
    }

    return result;
};

export interface ModifiedTagAppearanceArgs {
    id: number;
    tag_id?: number;
    start_page_id?: number;
    fill_color?: RgbaColor;
    outline_color?: RgbaColor;
    shape_type?: string;
    visible?: boolean;
    label_visible?: boolean;
    priority?: number;
}

interface RealModifiedTagAppearanceArgs {
    id: number;
    tag_id?: number;
    start_page_id?: number;
    fill_color?: string;
    outline_color?: string;
    shape_type?: string;
    visible?: number;
    label_visible?: number;
    priority?: number;
}

const modifiedTagAppearanceArgsToRealModifiedTagAppearanceArgs = (
    args: ModifiedTagAppearanceArgs,
): RealModifiedTagAppearanceArgs => {
    const result: RealModifiedTagAppearanceArgs = {
        id: args.id,
    };

    if (args.tag_id !== undefined) {
        result.tag_id = args.tag_id;
    }
    if (args.start_page_id !== undefined) {
        result.start_page_id = args.start_page_id;
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
    if (args.visible !== undefined) {
        result.visible = args.visible ? 1 : 0;
    }
    if (args.label_visible !== undefined) {
        result.label_visible = args.label_visible ? 1 : 0;
    }
    if (args.priority !== undefined) {
        result.priority = args.priority;
    }

    return result;
};

/**
 * Gets all tag appearances from the database.
 */
export async function getTagAppearances({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseTagAppearance[]> {
    const result = await db.query.tag_appearances.findMany();
    return result.map(realDatabaseTagAppearanceToDatabaseTagAppearance);
}

/**
 * Gets a single tag appearance by ID.
 */
export async function getTagAppearanceById({
    db,
    id,
}: {
    db: DbConnection;
    id: number;
}): Promise<DatabaseTagAppearance | undefined> {
    const result = await db.query.tag_appearances.findFirst({
        where: eq(schema.tag_appearances.id, id),
    });
    return result
        ? realDatabaseTagAppearanceToDatabaseTagAppearance(result)
        : undefined;
}

/**
 * Gets tag appearances by tag ID.
 */
export async function getTagAppearancesByTagId({
    db,
    tagId,
}: {
    db: DbConnection;
    tagId: number;
}): Promise<DatabaseTagAppearance[]> {
    const result = await db.query.tag_appearances.findMany({
        where: eq(schema.tag_appearances.tag_id, tagId),
    });
    return result.map(realDatabaseTagAppearanceToDatabaseTagAppearance);
}

/**
 * Gets tag appearances by page ID.
 */
export async function getTagAppearancesByPageId({
    db,
    pageId,
}: {
    db: DbConnection;
    pageId: number;
}): Promise<DatabaseTagAppearance[]> {
    const result = await db.query.tag_appearances.findMany({
        where: eq(schema.tag_appearances.start_page_id, pageId),
    });
    return result.map(realDatabaseTagAppearanceToDatabaseTagAppearance);
}

/**
 * Creates new tag appearances in the database.
 */
export async function createTagAppearances({
    newItems,
    db,
}: {
    newItems: NewTagAppearanceArgs[];
    db: DbConnection;
}): Promise<DatabaseTagAppearance[]> {
    if (newItems.length === 0) {
        console.log("No new tag appearances to create");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createTagAppearances",
        async (tx) => {
            return await createTagAppearancesInTransaction({
                newItems,
                tx,
            });
        },
    );
    return transactionResult;
}

export const createTagAppearancesInTransaction = async ({
    newItems,
    tx,
}: {
    newItems: NewTagAppearanceArgs[];
    tx: DbTransaction;
}): Promise<DatabaseTagAppearance[]> => {
    const createdItems = await tx
        .insert(schema.tag_appearances)
        .values(newItems.map(newTagAppearanceArgsToRealNewTagAppearanceArgs))
        .returning();

    return createdItems.map(realDatabaseTagAppearanceToDatabaseTagAppearance);
};

/**
 * Updates existing tag appearances in the database.
 */
export async function updateTagAppearances({
    db,
    modifiedItems,
}: {
    db: DbConnection;
    modifiedItems: ModifiedTagAppearanceArgs[];
}): Promise<DatabaseTagAppearance[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updateTagAppearances",
        async (tx) => {
            return await updateTagAppearancesInTransaction({
                modifiedItems,
                tx,
            });
        },
    );
    return transactionResult;
}

export const updateTagAppearancesInTransaction = async ({
    modifiedItems,
    tx,
}: {
    modifiedItems: ModifiedTagAppearanceArgs[];
    tx: DbTransaction;
}): Promise<DatabaseTagAppearance[]> => {
    const updatedItems: DatabaseTagAppearance[] = [];
    const realModifiedItems = modifiedItems.map(
        modifiedTagAppearanceArgsToRealModifiedTagAppearanceArgs,
    );

    for (const modifiedItem of realModifiedItems) {
        const { id, ...updateData } = modifiedItem;
        const updatedItem = await tx
            .update(schema.tag_appearances)
            .set(updateData)
            .where(eq(schema.tag_appearances.id, id))
            .returning()
            .get();
        updatedItems.push(
            realDatabaseTagAppearanceToDatabaseTagAppearance(updatedItem),
        );
    }

    return updatedItems;
};

/**
 * Deletes tag appearances from the database.
 */
export async function deleteTagAppearances({
    itemIds,
    db,
}: {
    itemIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseTagAppearance[]> {
    if (itemIds.size === 0) return [];

    const response = await transactionWithHistory(
        db,
        "deleteTagAppearances",
        async (tx) => {
            return await deleteTagAppearancesInTransaction({
                itemIds,
                tx,
            });
        },
    );
    return response;
}

const deleteTagAppearancesInTransaction = async ({
    itemIds,
    tx,
}: {
    itemIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseTagAppearance[]> => {
    const deletedItems = await tx
        .delete(schema.tag_appearances)
        .where(inArray(schema.tag_appearances.id, Array.from(itemIds)))
        .returning();

    return deletedItems.map(realDatabaseTagAppearanceToDatabaseTagAppearance);
};

// ============================================================================
// MARCHER TAGS
// ============================================================================

/** How a marcher_tag is represented in the database */
export type DatabaseMarcherTag = typeof schema.marcher_tags.$inferSelect;

export interface NewMarcherTagArgs {
    marcher_id: number;
    tag_id: number;
}

export interface ModifiedMarcherTagArgs {
    id: number;
    marcher_id?: number;
    tag_id?: number;
}

/**
 * Gets all marcher_tags from the database.
 */
export async function getMarcherTags({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseMarcherTag[]> {
    const result = await db.query.marcher_tags.findMany();
    return result;
}

/**
 * Gets a single marcher_tag by ID.
 */
export async function getMarcherTagById({
    db,
    id,
}: {
    db: DbConnection;
    id: number;
}): Promise<DatabaseMarcherTag | undefined> {
    const result = await db.query.marcher_tags.findFirst({
        where: eq(schema.marcher_tags.id, id),
    });
    return result;
}

/**
 * Gets marcher_tags by marcher ID.
 */
export async function getMarcherTagsByMarcherId({
    db,
    marcherId,
}: {
    db: DbConnection;
    marcherId: number;
}): Promise<DatabaseMarcherTag[]> {
    const result = await db.query.marcher_tags.findMany({
        where: eq(schema.marcher_tags.marcher_id, marcherId),
    });
    return result;
}

/**
 * Gets marcher_tags by tag ID.
 */
export async function getMarcherTagsByTagId({
    db,
    tagId,
}: {
    db: DbConnection;
    tagId: number;
}): Promise<DatabaseMarcherTag[]> {
    const result = await db.query.marcher_tags.findMany({
        where: eq(schema.marcher_tags.tag_id, tagId),
    });
    return result;
}

/**
 * Creates new marcher_tags in the database.
 */
export async function createMarcherTags({
    newMarcherTags,
    db,
}: {
    newMarcherTags: NewMarcherTagArgs[];
    db: DbConnection;
}): Promise<DatabaseMarcherTag[]> {
    if (newMarcherTags.length === 0) {
        console.log("No new marcher_tags to create");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createMarcherTags",
        async (tx) => {
            return await createMarcherTagsInTransaction({
                newMarcherTags,
                tx,
            });
        },
    );
    return transactionResult;
}

export const createMarcherTagsInTransaction = async ({
    newMarcherTags,
    tx,
}: {
    newMarcherTags: NewMarcherTagArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMarcherTag[]> => {
    const createdMarcherTags = await tx
        .insert(schema.marcher_tags)
        .values(newMarcherTags)
        .returning();

    return createdMarcherTags;
};

/**
 * Updates existing marcher_tags in the database.
 */
export async function updateMarcherTags({
    db,
    modifiedMarcherTags,
}: {
    db: DbConnection;
    modifiedMarcherTags: ModifiedMarcherTagArgs[];
}): Promise<DatabaseMarcherTag[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updateMarcherTags",
        async (tx) => {
            return await updateMarcherTagsInTransaction({
                modifiedMarcherTags,
                tx,
            });
        },
    );
    return transactionResult;
}

export const updateMarcherTagsInTransaction = async ({
    modifiedMarcherTags,
    tx,
}: {
    modifiedMarcherTags: ModifiedMarcherTagArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMarcherTag[]> => {
    const updatedMarcherTags: DatabaseMarcherTag[] = [];

    for (const modifiedMarcherTag of modifiedMarcherTags) {
        const { id, ...updateData } = modifiedMarcherTag;
        const updatedMarcherTag = await tx
            .update(schema.marcher_tags)
            .set(updateData)
            .where(eq(schema.marcher_tags.id, id))
            .returning()
            .get();
        updatedMarcherTags.push(updatedMarcherTag);
    }

    return updatedMarcherTags;
};

/**
 * Deletes marcher_tags from the database.
 */
export async function deleteMarcherTags({
    marcherTagIds,
    db,
}: {
    marcherTagIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseMarcherTag[]> {
    if (marcherTagIds.size === 0) return [];

    const response = await transactionWithHistory(
        db,
        "deleteMarcherTags",
        async (tx) => {
            return await deleteMarcherTagsInTransaction({
                marcherTagIds,
                tx,
            });
        },
    );
    return response;
}

const deleteMarcherTagsInTransaction = async ({
    marcherTagIds,
    tx,
}: {
    marcherTagIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseMarcherTag[]> => {
    const deletedMarcherTags = await tx
        .delete(schema.marcher_tags)
        .where(inArray(schema.marcher_tags.id, Array.from(marcherTagIds)))
        .returning();

    return deletedMarcherTags;
};
