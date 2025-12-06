import { eq, inArray } from "drizzle-orm";
import {
    DatabasePage,
    DbConnection,
    DbTransaction,
    transactionWithHistory,
} from "@/db-functions";
import { schema } from "@/global/database/db";
import {
    AppearanceComponent,
    AppearanceComponentOptional,
    appearanceModelParsedToRawOptional,
    AppearanceComponentRaw,
    AppearanceComponentRawOptional,
    appearanceModelRawToParsed,
} from "@/entity-components/appearance";

// ============================================================================
// TAGS
// ============================================================================

/** How a tag is represented in the database */
export type DatabaseTag = typeof schema.tags.$inferSelect;

export const getTagName = (tag: { tag_id: number; name?: string | null }) =>
    tag.name != null && tag.name.trim().length > 0
        ? tag.name
        : `tag-${tag.tag_id}`;

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
    db: DbConnection | DbTransaction;
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
    db: DbConnection | DbTransaction;
    id: number;
}): Promise<DatabaseTag | undefined> {
    const result = await db.query.tags.findFirst({
        where: eq(schema.tags.id, id),
    });
    return result;
}

export const createTags = async ({
    newTags,
    db,
}: {
    newTags: NewTagArgs[];
    db: DbConnection;
}): Promise<DatabaseTag[]> => {
    const transactionResult = await transactionWithHistory(
        db,
        "createTags",
        async (tx) => {
            return await _createTagsInTransaction({ newTags, tx });
        },
    );
    return transactionResult;
};

export const _createTagsInTransaction = async ({
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

export const deleteTagsInTransaction = async ({
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
export interface TagAppearance extends AppearanceComponent {
    id: number;
    tag_id: number;
    start_page_id: number;
    priority: number;
    created_at: string;
    updated_at: string;
}

type DatabaseTagAppearance = typeof schema.tag_appearances.$inferSelect;

export const realDatabaseTagAppearanceToDatabaseTagAppearance = (
    item: DatabaseTagAppearance,
): TagAppearance => {
    return {
        ...item,
        ...appearanceModelRawToParsed(item),
    };
};

export interface NewTagAppearanceArgs extends Partial<AppearanceComponent> {
    tag_id: number;
    start_page_id: number;
    priority?: number;
}

interface RealNewTagAppearanceArgs extends Partial<AppearanceComponentRaw> {
    tag_id: number;
    start_page_id: number;
    priority?: number;
}

const newTagAppearanceArgsToRealNewTagAppearanceArgs = (
    args: NewTagAppearanceArgs,
): RealNewTagAppearanceArgs => {
    return {
        tag_id: args.tag_id,
        start_page_id: args.start_page_id,
        ...appearanceModelParsedToRawOptional({
            ...args,
            visible: true,
            label_visible: true,
        }),
    };
};

export interface ModifiedTagAppearanceArgs extends AppearanceComponentOptional {
    id: number;
    tag_id?: number;
    start_page_id?: number;
    priority?: number;
}

interface RealModifiedTagAppearanceArgs extends AppearanceComponentRawOptional {
    id: number;
    tag_id?: number;
    start_page_id?: number;
    priority?: number;
}

const modifiedTagAppearanceArgsToRealModifiedTagAppearanceArgs = (
    args: ModifiedTagAppearanceArgs,
): RealModifiedTagAppearanceArgs => {
    const result: RealModifiedTagAppearanceArgs = {
        id: args.id,
        ...appearanceModelParsedToRawOptional({
            ...args,
            visible: true,
            label_visible: true,
        }),
    };

    return result;
};

export type TagAppearanceIdsByPageId = Map<number, Set<number>>;
/**
 * Calculate the tag_appearance ID for every page.
 */
export const _calculateMapAllTagAppearanceIdsByPageId = ({
    tagAppearances,
    pagesInOrder,
}: {
    tagAppearances: Pick<TagAppearance, "id" | "tag_id" | "start_page_id">[];
    pagesInOrder: Pick<DatabasePage, "id">[];
}): TagAppearanceIdsByPageId => {
    const output: TagAppearanceIdsByPageId = new Map();

    const pageIdToOrder: Record<number, number> = {};
    pagesInOrder.forEach((page, index) => {
        pageIdToOrder[page.id] = index;
    });

    // Initialize the map with empty sets for each page
    for (const page of pagesInOrder) output.set(page.id, new Set<number>());

    // Group tag appearances by tag_id
    const appearancesByTagId: Record<number, typeof tagAppearances> = {};
    for (const appearance of tagAppearances) {
        if (!appearancesByTagId[appearance.tag_id])
            appearancesByTagId[appearance.tag_id] = [];
        appearancesByTagId[appearance.tag_id].push(appearance);
    }

    // For each tag, sort its appearances by page order and determine which pages they apply to
    for (const appearances of Object.values(appearancesByTagId)) {
        // Sort appearances by the order of their start_page_id
        const sortedAppearances = [...appearances].sort((a, b) => {
            const orderA = pageIdToOrder[a.start_page_id] ?? -1;
            const orderB = pageIdToOrder[b.start_page_id] ?? -1;
            return orderA - orderB;
        });

        // For each appearance, determine which pages it applies to
        for (let i = 0; i < sortedAppearances.length; i++) {
            const currentAppearance = sortedAppearances[i];
            const nextAppearance = sortedAppearances[i + 1];

            const startPageOrder =
                pageIdToOrder[currentAppearance.start_page_id];
            if (startPageOrder === undefined) continue;

            // Determine the end page order (exclusive)
            const endPageOrder = nextAppearance
                ? pageIdToOrder[nextAppearance.start_page_id]
                : pagesInOrder.length;

            if (endPageOrder === undefined) continue;

            // Add this appearance to all pages from start to end (exclusive)
            for (
                let pageOrder = startPageOrder;
                pageOrder < endPageOrder;
                pageOrder++
            ) {
                const page = pagesInOrder[pageOrder];
                const pageAppearances = output.get(page.id);
                if (pageAppearances) {
                    pageAppearances.add(currentAppearance.id);
                }
            }
        }
    }

    return output;
};

/**
 * Gets all tag appearances from the database.
 */
export async function getTagAppearances({
    db,
}: {
    db: DbConnection;
}): Promise<TagAppearance[]> {
    const result = await db.query.tag_appearances.findMany();
    return result.map(realDatabaseTagAppearanceToDatabaseTagAppearance);
}

/**
 * Gets tag appearances by page ID.
 *
 * Note, you must provide the tag appearance IDs by page ID map.
 * This is because we only store the starting page ID of the tag appearance.
 */
export async function getResolvedTagAppearancesByPageId({
    db,
    pageId,
    tagAppearanceIdsByPageId,
}: {
    db: DbConnection;
    pageId: number;
    tagAppearanceIdsByPageId: TagAppearanceIdsByPageId;
}): Promise<TagAppearance[]> {
    const tagAppearanceIds = tagAppearanceIdsByPageId.get(pageId);
    if (!tagAppearanceIds) {
        console.debug(
            `No tag appearance IDs found for page ID ${pageId}. This should never happen.`,
        );
        return [];
    }
    const result = await db.query.tag_appearances.findMany({
        where: inArray(schema.tag_appearances.id, Array.from(tagAppearanceIds)),
    });
    return result.map(realDatabaseTagAppearanceToDatabaseTagAppearance);
}

export async function getTagAppearancesByStartPageId({
    db,
    pageId,
}: {
    db: DbConnection;
    pageId: number;
}): Promise<TagAppearance[]> {
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
}): Promise<TagAppearance[]> {
    if (newItems.length === 0) {
        console.warn("No new tag appearances to create");
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
}): Promise<TagAppearance[]> => {
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
}): Promise<TagAppearance[]> {
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
}): Promise<TagAppearance[]> => {
    const updatedItems: TagAppearance[] = [];
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
}): Promise<TagAppearance[]> {
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
}): Promise<TagAppearance[]> => {
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

/** Map<tag_id, Array<marcher_id>> */
export type MarcherIdsByTagId = Map<number, Array<number>>;

/**
 * Gets a map of all marcher_ids by tag_id.
 *
 * ```typescript
 * {
 *     tag_id: [marcher_id, marcher_id, ...],
 *     tag_id: [marcher_id, marcher_id, ...],
 *     ...
 * }
 * ```
 *
 * @param db The database connection
 * @returns A map of tag_id to an array of marcher_ids that have that tag
 */
export async function getMarcherIdsByTagIdMap({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<MarcherIdsByTagId> {
    const allTagIds = await db.query.tags.findMany({
        columns: {
            id: true,
        },
    });
    const output: MarcherIdsByTagId = new Map();

    // Initialize the map with empty arrays for each tag_id
    for (const { id: tagId } of allTagIds) output.set(tagId, []);

    const allMarcherTags = await db.query.marcher_tags.findMany({
        columns: {
            tag_id: true,
            marcher_id: true,
        },
    });

    for (const { tag_id, marcher_id } of allMarcherTags) {
        const arr = output.get(tag_id);
        if (!arr) {
            console.error(
                `Tag ID ${tag_id} not found in output map. This should never happen.`,
            );
            continue;
        }
        arr.push(marcher_id);
    }

    return output;
}

export async function createNewTagFromMarcherIds({
    marcherIds,
    tagName,
    db,
}: {
    marcherIds: Set<number>;
    tagName: string | null;
    db: DbConnection;
}): Promise<{
    newTag: DatabaseTag;
    newMarcherTags: DatabaseMarcherTag[];
} | void> {
    if (marcherIds.size === 0) {
        console.warn("No new marcher_tags to create");
        return;
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createMarcherTags",
        async (tx) => {
            const newTag = await _createTagsInTransaction({
                newTags: [{ name: tagName }],
                tx,
            });
            const newMarcherTags = await _createMarcherTagsInTransaction({
                newMarcherTags: Array.from(marcherIds).map((marcherId) => ({
                    marcher_id: marcherId,
                    tag_id: newTag[0].id,
                })),
                tx,
            });
            return { newTag: newTag[0], newMarcherTags };
        },
    );
    return transactionResult;
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
        console.warn("No new marcher_tags to create");
        return [];
    }

    const transactionResult = await transactionWithHistory(
        db,
        "createMarcherTags",
        async (tx) => {
            return await _createMarcherTagsInTransaction({
                newMarcherTags,
                tx,
            });
        },
    );
    return transactionResult;
}

export const _createMarcherTagsInTransaction = async ({
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
            return await _updateMarcherTagsInTransaction({
                modifiedMarcherTags,
                tx,
            });
        },
    );
    return transactionResult;
}

export const _updateMarcherTagsInTransaction = async ({
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
            return await _deleteMarcherTagsInTransaction({
                marcherTagIds,
                tx,
            });
        },
    );
    return response;
}

const _deleteMarcherTagsInTransaction = async ({
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
