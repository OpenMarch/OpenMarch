import { eq, inArray, lte, desc } from "drizzle-orm";
import {
    DbConnection,
    DbTransaction,
    transactionWithHistory,
} from "@/db-functions";
import { schema } from "@/global/database/db";
import { LightingEffectType } from "@openmarch/core";

// ============================================================================
// LIGHTING SCENES
// ============================================================================

/** Row from `lighting_scenes`. */
export type DatabaseLightingScene = typeof schema.lighting_scenes.$inferSelect;

export type NewLightingSceneArgs = Omit<
    typeof schema.lighting_scenes.$inferInsert,
    "id"
>;

export interface ModifiedLightingSceneArgs {
    id: number;
    start_page_id?: number;
    name?: string | null;
}

/**
 * Gets all lighting scenes.
 */
export async function getLightingScenes({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<DatabaseLightingScene[]> {
    return await db.query.lighting_scenes.findMany();
}

/**
 * Gets a lighting scene by id.
 */
export async function getLightingSceneById({
    db,
    id,
}: {
    db: DbConnection | DbTransaction;
    id: number;
}): Promise<DatabaseLightingScene | undefined> {
    return await db.query.lighting_scenes.findFirst({
        where: eq(schema.lighting_scenes.id, id),
    });
}

/**
 * Lighting scene that falls on the given page.
 *
 * @param pageId - The page ID to get the lighting scene for.
 * @returns The lighting scene that falls on the given page, or undefined if no lighting scene falls on the given page.
 */
export const getLightingSceneInPageId = async ({
    db,
    pageId,
}: {
    db: DbConnection | DbTransaction;
    pageId: number;
}): Promise<DatabaseLightingScene | undefined> => {
    const pageObj = await db
        .select({
            pageId: schema.pages.id,
            beatPosition: schema.beats.position,
        })
        .from(schema.pages)
        .innerJoin(schema.beats, eq(schema.pages.start_beat, schema.beats.id))
        .where(eq(schema.pages.id, pageId))
        .get();
    if (!pageObj) throw new Error(`Page ${pageId} not found`);

    const lightingScene = await db
        .select()
        .from(schema.lighting_scenes)
        .innerJoin(
            schema.pages,
            eq(schema.lighting_scenes.start_page_id, schema.pages.id),
        )
        .innerJoin(schema.beats, eq(schema.pages.start_beat, schema.beats.id))
        .where(lte(schema.beats.position, pageObj.beatPosition))
        .orderBy(desc(schema.beats.position))
        .limit(1)
        .get();

    return lightingScene?.lighting_scenes;
};

/**
 * Creates a map of lighting scene ids to their start page positions.
 * @param db - The database connection.
 * @returns A map of lighting scene ids to their start page positions.
 */
export async function getLightingScenePositionByLightingSceneIdMap({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<Record<number, number>> {
    const scenes = await db
        .select()
        .from(schema.lighting_scenes)
        .innerJoin(
            schema.pages,
            eq(schema.lighting_scenes.start_page_id, schema.pages.id),
        )
        .innerJoin(schema.beats, eq(schema.pages.start_beat, schema.beats.id))
        .all();
    const result: Record<number, number> = {};
    for (const scene of scenes) {
        result[scene.lighting_scenes.id] = scene.beats.position;
    }
    return result;
}

/**
 * Gets lighting scenes that start on the given page.
 */
export async function getLightingScenesByStartPageId({
    db,
    startPageId,
}: {
    db: DbConnection | DbTransaction;
    startPageId: number;
}): Promise<DatabaseLightingScene[]> {
    return await db.query.lighting_scenes.findMany({
        where: eq(schema.lighting_scenes.start_page_id, startPageId),
    });
}

/**
 * Creates lighting scenes. Depends on existing `pages.id` rows for `start_page_id`.
 *
 * When building a full scene with effects and marcher links, create in order:
 * scene → effects → `marcher_lighting_effects`.
 */
export async function createLightingScenes({
    db,
    newScenes,
}: {
    db: DbConnection;
    newScenes: NewLightingSceneArgs[];
}): Promise<DatabaseLightingScene[]> {
    if (newScenes.length === 0) return [];

    return await transactionWithHistory(
        db,
        "createLightingScenes",
        async (tx) => {
            return await _createLightingScenesInTransaction({
                newScenes,
                tx,
            });
        },
    );
}

export async function _createLightingScenesInTransaction({
    newScenes,
    tx,
}: {
    newScenes: NewLightingSceneArgs[];
    tx: DbTransaction;
}): Promise<DatabaseLightingScene[]> {
    return await tx
        .insert(schema.lighting_scenes)
        .values(newScenes)
        .returning();
}

export async function updateLightingScenes({
    db,
    modifiedScenes,
}: {
    db: DbConnection;
    modifiedScenes: ModifiedLightingSceneArgs[];
}): Promise<DatabaseLightingScene[]> {
    if (modifiedScenes.length === 0) return [];

    return await transactionWithHistory(
        db,
        "updateLightingScenes",
        async (tx) => {
            return await updateLightingScenesInTransaction({
                modifiedScenes,
                tx,
            });
        },
    );
}

export async function updateLightingScenesInTransaction({
    modifiedScenes,
    tx,
}: {
    modifiedScenes: ModifiedLightingSceneArgs[];
    tx: DbTransaction;
}): Promise<DatabaseLightingScene[]> {
    const updated: DatabaseLightingScene[] = [];

    for (const row of modifiedScenes) {
        const { id, ...rest } = row;
        const result = await tx
            .update(schema.lighting_scenes)
            .set(rest)
            .where(eq(schema.lighting_scenes.id, id))
            .returning()
            .get();
        updated.push(result);
    }

    return updated;
}

export async function deleteLightingScenes({
    db,
    sceneIds,
}: {
    db: DbConnection;
    sceneIds: Set<number>;
}): Promise<DatabaseLightingScene[]> {
    if (sceneIds.size === 0) return [];

    return await transactionWithHistory(
        db,
        "deleteLightingScenes",
        async (tx) => {
            return await deleteLightingScenesInTransaction({
                sceneIds,
                tx,
            });
        },
    );
}

export async function deleteLightingScenesInTransaction({
    sceneIds,
    tx,
}: {
    sceneIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseLightingScene[]> {
    return await tx
        .delete(schema.lighting_scenes)
        .where(inArray(schema.lighting_scenes.id, Array.from(sceneIds)))
        .returning();
}

// ============================================================================
// LIGHTING EFFECTS
// ============================================================================

/** Row from `lighting_effects`. */
export type DatabaseLightingEffect =
    typeof schema.lighting_effects.$inferSelect;

export type LightingEffectWithMarchers = DatabaseLightingEffect & {
    marcherIds: Set<number>;
};

export type NewLightingEffectArgs = Omit<
    typeof schema.lighting_effects.$inferInsert,
    "id"
>;

export interface ModifiedLightingEffectArgs {
    id: number;
    type?: LightingEffectType;
    args?: string;
    name?: string | null;
}

export async function getLightingEffectIdsBySceneId({
    db,
    sceneId,
}: {
    db: DbConnection | DbTransaction;
    sceneId: number;
}): Promise<number[]> {
    const rows = await db
        .select({ id: schema.lighting_effects.id })
        .from(schema.lighting_effects)
        .where(eq(schema.lighting_effects.scene_id, sceneId));
    return rows.map((row) => row.id);
}

/**
 * Gets all lighting effects.
 */
export async function getLightingEffects({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<DatabaseLightingEffect[]> {
    return await db.query.lighting_effects.findMany();
}

/**
 * Gets a lighting effect by id.
 */
export async function getLightingEffectById({
    db,
    id,
}: {
    db: DbConnection | DbTransaction;
    id: number;
}): Promise<DatabaseLightingEffect | undefined> {
    return await db.query.lighting_effects.findFirst({
        where: eq(schema.lighting_effects.id, id),
    });
}

export async function getLightingEffectWithMarchersById({
    db,
    id,
}: {
    db: DbConnection | DbTransaction;
    id: number;
}): Promise<LightingEffectWithMarchers | undefined> {
    const effect = await db.query.lighting_effects.findFirst({
        where: eq(schema.lighting_effects.id, id),
    });
    if (!effect) return undefined;
    const marcherLightingEffects =
        await getMarcherLightingEffectsByLightingEffectId({
            db,
            lightingEffectId: id,
        });
    const marcherIds = new Set(
        marcherLightingEffects.map((mle) => mle.marcher_id),
    );
    return { ...effect, marcherIds: marcherIds };
}

/**
 * Gets lighting effects for a scene.
 */
export async function getLightingEffectsBySceneId({
    db,
    sceneId,
}: {
    db: DbConnection | DbTransaction;
    sceneId: number;
}): Promise<DatabaseLightingEffect[]> {
    return await db.query.lighting_effects.findMany({
        where: eq(schema.lighting_effects.scene_id, sceneId),
    });
}

/**
 * Creates lighting effects. Depends on existing `lighting_scenes.id` for `scene_id`.
 */
export async function createLightingEffects({
    db,
    newEffects,
}: {
    db: DbConnection;
    newEffects: NewLightingEffectArgs[];
}): Promise<DatabaseLightingEffect[]> {
    if (newEffects.length === 0) return [];

    const result = await transactionWithHistory(
        db,
        "createLightingEffects",
        async (tx) => {
            return await _createLightingEffectsInTransaction({
                newEffects,
                tx,
            });
        },
    );

    // Temporarily make every marcher have the effect
    // TODO: Remove this once we have a way to select marchers for an effect
    const allMarchers = await db.query.marchers.findMany();
    const newMarcherLightingEffects: NewMarcherLightingEffectArgs[] = [];
    for (const marcher of allMarchers) {
        newMarcherLightingEffects.push({
            marcher_id: marcher.id,
            lighting_effect_id: result[0].id,
        });
    }
    await createMarcherLightingEffects({
        db,
        newLinks: newMarcherLightingEffects,
    });
    return result;
}

export async function _createLightingEffectsInTransaction({
    newEffects,
    tx,
}: {
    newEffects: NewLightingEffectArgs[];
    tx: DbTransaction;
}): Promise<DatabaseLightingEffect[]> {
    return await tx
        .insert(schema.lighting_effects)
        .values(newEffects)
        .returning();
}

export async function updateLightingEffects({
    db,
    modifiedEffects,
}: {
    db: DbConnection;
    modifiedEffects: ModifiedLightingEffectArgs[];
}): Promise<DatabaseLightingEffect[]> {
    if (modifiedEffects.length === 0) return [];

    return await transactionWithHistory(
        db,
        "updateLightingEffects",
        async (tx) => {
            return await updateLightingEffectsInTransaction({
                modifiedEffects,
                tx,
            });
        },
    );
}

export async function updateLightingEffectsInTransaction({
    modifiedEffects,
    tx,
}: {
    modifiedEffects: ModifiedLightingEffectArgs[];
    tx: DbTransaction;
}): Promise<DatabaseLightingEffect[]> {
    const updated: DatabaseLightingEffect[] = [];

    for (const row of modifiedEffects) {
        const { id, ...rest } = row;
        const result = await tx
            .update(schema.lighting_effects)
            .set(rest)
            .where(eq(schema.lighting_effects.id, id))
            .returning()
            .get();
        updated.push(result);
    }

    return updated;
}

export async function deleteLightingEffects({
    db,
    effectIds,
}: {
    db: DbConnection;
    effectIds: Set<number>;
}): Promise<DatabaseLightingEffect[]> {
    if (effectIds.size === 0) return [];

    return await transactionWithHistory(
        db,
        "deleteLightingEffects",
        async (tx) => {
            return await deleteLightingEffectsInTransaction({
                effectIds,
                tx,
            });
        },
    );
}

export async function deleteLightingEffectsInTransaction({
    effectIds,
    tx,
}: {
    effectIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseLightingEffect[]> {
    return await tx
        .delete(schema.lighting_effects)
        .where(inArray(schema.lighting_effects.id, Array.from(effectIds)))
        .returning();
}

// ============================================================================
// MARCHER LIGHTING EFFECTS
// ============================================================================

/** Row from `marcher_lighting_effects`. */
export type DatabaseMarcherLightingEffect =
    typeof schema.marcher_lighting_effects.$inferSelect;

export type NewMarcherLightingEffectArgs = Omit<
    typeof schema.marcher_lighting_effects.$inferInsert,
    "id"
>;

export interface ModifiedMarcherLightingEffectArgs {
    id: number;
    lighting_effect_id?: number;
    marcher_id?: number;
}

/**
 * Gets all marcher–effect links.
 */
export async function getMarcherLightingEffects({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<DatabaseMarcherLightingEffect[]> {
    return await db.query.marcher_lighting_effects.findMany();
}

/**
 * Gets a marcher lighting effect row by id.
 */
export async function getMarcherLightingEffectById({
    db,
    id,
}: {
    db: DbConnection | DbTransaction;
    id: number;
}): Promise<DatabaseMarcherLightingEffect | undefined> {
    return await db.query.marcher_lighting_effects.findFirst({
        where: eq(schema.marcher_lighting_effects.id, id),
    });
}

/**
 * Gets links for a lighting effect.
 */
export async function getMarcherLightingEffectsByLightingEffectId({
    db,
    lightingEffectId,
}: {
    db: DbConnection | DbTransaction;
    lightingEffectId: number;
}): Promise<DatabaseMarcherLightingEffect[]> {
    return await db.query.marcher_lighting_effects.findMany({
        where: eq(
            schema.marcher_lighting_effects.lighting_effect_id,
            lightingEffectId,
        ),
    });
}

/**
 * Gets lighting-effect links for a marcher.
 */
export async function getMarcherLightingEffectsByMarcherId({
    db,
    marcherId,
}: {
    db: DbConnection | DbTransaction;
    marcherId: number;
}): Promise<DatabaseMarcherLightingEffect[]> {
    return await db.query.marcher_lighting_effects.findMany({
        where: eq(schema.marcher_lighting_effects.marcher_id, marcherId),
    });
}

/**
 * Creates marcher–effect links. Depends on existing `lighting_effects.id` and `marchers.id`.
 * Unique on (`lighting_effect_id`, `marcher_id`).
 */
export async function createMarcherLightingEffects({
    db,
    newLinks,
}: {
    db: DbConnection;
    newLinks: NewMarcherLightingEffectArgs[];
}): Promise<DatabaseMarcherLightingEffect[]> {
    if (newLinks.length === 0) return [];

    return await transactionWithHistory(
        db,
        "createMarcherLightingEffects",
        async (tx) => {
            return await _createMarcherLightingEffectsInTransaction({
                newLinks,
                tx,
            });
        },
    );
}

export async function _createMarcherLightingEffectsInTransaction({
    newLinks,
    tx,
}: {
    newLinks: NewMarcherLightingEffectArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMarcherLightingEffect[]> {
    return await tx
        .insert(schema.marcher_lighting_effects)
        .values(newLinks)
        .returning();
}

export async function updateMarcherLightingEffects({
    db,
    modifiedLinks,
}: {
    db: DbConnection;
    modifiedLinks: ModifiedMarcherLightingEffectArgs[];
}): Promise<DatabaseMarcherLightingEffect[]> {
    if (modifiedLinks.length === 0) return [];

    return await transactionWithHistory(
        db,
        "updateMarcherLightingEffects",
        async (tx) => {
            return await updateMarcherLightingEffectsInTransaction({
                modifiedLinks,
                tx,
            });
        },
    );
}

export async function updateMarcherLightingEffectsInTransaction({
    modifiedLinks,
    tx,
}: {
    modifiedLinks: ModifiedMarcherLightingEffectArgs[];
    tx: DbTransaction;
}): Promise<DatabaseMarcherLightingEffect[]> {
    const updated: DatabaseMarcherLightingEffect[] = [];

    for (const row of modifiedLinks) {
        const { id, ...rest } = row;
        const result = await tx
            .update(schema.marcher_lighting_effects)
            .set(rest)
            .where(eq(schema.marcher_lighting_effects.id, id))
            .returning()
            .get();
        updated.push(result);
    }

    return updated;
}

export async function deleteMarcherLightingEffects({
    db,
    linkIds,
}: {
    db: DbConnection;
    linkIds: Set<number>;
}): Promise<DatabaseMarcherLightingEffect[]> {
    if (linkIds.size === 0) return [];

    return await transactionWithHistory(
        db,
        "deleteMarcherLightingEffects",
        async (tx) => {
            return await deleteMarcherLightingEffectsInTransaction({
                linkIds,
                tx,
            });
        },
    );
}

export async function deleteMarcherLightingEffectsInTransaction({
    linkIds,
    tx,
}: {
    linkIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseMarcherLightingEffect[]> {
    return await tx
        .delete(schema.marcher_lighting_effects)
        .where(inArray(schema.marcher_lighting_effects.id, Array.from(linkIds)))
        .returning();
}
