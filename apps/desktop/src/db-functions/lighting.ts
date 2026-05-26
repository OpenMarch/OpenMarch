import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
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
 * Upcoming lighting scene from the given page onward.
 *
 * @param pageId - The current page ID.
 * @returns The nearest scene whose start beat is >= the page beat, or undefined.
 */
export const getUpcomingLightingSceneInPageId = async ({
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
        .where(gte(schema.beats.position, pageObj.beatPosition))
        .orderBy(asc(schema.beats.position))
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
 * Typical order when authoring: scene → lighting groups → effects + effect–group links.
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

export type DeleteLightingSceneWithReassignmentResult = {
    deletedScenes: DatabaseLightingScene[];
    reassignedScene: DatabaseLightingScene | null;
};

export async function deleteLightingSceneWithReassignment({
    db,
    sceneId,
    reassignedSceneId,
    reassignedStartPageId,
}: {
    db: DbConnection;
    sceneId: number;
    reassignedSceneId?: number | null;
    reassignedStartPageId?: number;
}): Promise<DeleteLightingSceneWithReassignmentResult> {
    return await transactionWithHistory(
        db,
        "deleteLightingSceneWithReassignment",
        async (tx) => {
            const deletedScenes = await deleteLightingScenesInTransaction({
                sceneIds: new Set([sceneId]),
                tx,
            });

            if (
                reassignedSceneId == null ||
                reassignedStartPageId == null ||
                deletedScenes.length === 0
            ) {
                return {
                    deletedScenes,
                    reassignedScene: null,
                };
            }

            const [reassignedScene] = await updateLightingScenesInTransaction({
                modifiedScenes: [
                    {
                        id: reassignedSceneId,
                        start_page_id: reassignedStartPageId,
                    },
                ],
                tx,
            });

            return {
                deletedScenes,
                reassignedScene: reassignedScene ?? null,
            };
        },
    );
}

// ============================================================================
// LIGHTING GROUPS
// ============================================================================

export type DatabaseLightingGroup = typeof schema.lighting_groups.$inferSelect;

export type NewLightingGroupArgs = Omit<
    typeof schema.lighting_groups.$inferInsert,
    "id"
> & {
    marcher_ids: readonly number[];
};

export interface ModifiedLightingGroupArgs {
    id: number;
    name?: string | null;
}

async function ensureUniqueMarcherIds(
    marcherIds: readonly number[],
): Promise<void> {
    const seen = new Set<number>();
    for (const id of marcherIds) {
        if (seen.has(id))
            throw new Error(`Duplicate marcher_id ${id} in group`);
        seen.add(id);
    }
}

async function assertLightingGroupIdsBelongToScene({
    tx,
    sceneId,
    groupIds,
}: {
    tx: DbTransaction;
    sceneId: number;
    groupIds: readonly number[];
}): Promise<void> {
    if (groupIds.length === 0) return;
    const unique = [...new Set(groupIds)];
    const rows = await tx.query.lighting_groups.findMany({
        where: inArray(schema.lighting_groups.id, unique),
    });
    if (rows.length !== unique.length) {
        throw new Error("One or more lighting groups were not found.");
    }
    for (const g of rows) {
        if (g.scene_id !== sceneId) {
            throw new Error(
                `Lighting group ${g.id} belongs to scene ${g.scene_id}, expected ${sceneId}.`,
            );
        }
    }
}

export async function getLightingGroupsBySceneId({
    db,
    sceneId,
}: {
    db: DbConnection | DbTransaction;
    sceneId: number;
}): Promise<DatabaseLightingGroup[]> {
    return await db.query.lighting_groups.findMany({
        where: eq(schema.lighting_groups.scene_id, sceneId),
    });
}

export async function getLightingGroupById({
    db,
    id,
}: {
    db: DbConnection | DbTransaction;
    id: number;
}): Promise<DatabaseLightingGroup | undefined> {
    return await db.query.lighting_groups.findFirst({
        where: eq(schema.lighting_groups.id, id),
    });
}

export async function getMarcherIdsByLightingGroupId({
    db,
    groupId,
}: {
    db: DbConnection | DbTransaction;
    groupId: number;
}): Promise<number[]> {
    const rows = await db.query.lighting_group_marchers.findMany({
        where: eq(schema.lighting_group_marchers.group_id, groupId),
    });
    return rows.map((r) => r.marcher_id);
}

/**
 * Marcher memberships for all groups in a scene (one query).
 * Maps group ID → marcher IDs in that group.
 */
export async function getLightingGroupMembershipsBySceneId({
    db,
    sceneId,
}: {
    db: DbConnection | DbTransaction;
    sceneId: number;
}): Promise<Map<number, Set<number>>> {
    const rows = await db.query.lighting_group_marchers.findMany({
        where: eq(schema.lighting_group_marchers.scene_id, sceneId),
    });
    const out = new Map<number, Set<number>>();
    for (const r of rows) {
        let set = out.get(r.group_id);
        if (!set) {
            set = new Set<number>();
            out.set(r.group_id, set);
        }
        set.add(r.marcher_id);
    }
    return out;
}

async function deleteLightingGroupMembershipsForMarchersInScene({
    tx,
    sceneId,
    marcherIds,
}: {
    tx: DbTransaction;
    sceneId: number;
    marcherIds: readonly number[];
}): Promise<void> {
    if (marcherIds.length === 0) return;
    const unique = [...new Set(marcherIds)];
    await tx
        .delete(schema.lighting_group_marchers)
        .where(
            and(
                eq(schema.lighting_group_marchers.scene_id, sceneId),
                inArray(schema.lighting_group_marchers.marcher_id, unique),
            ),
        );
}

/** Creates groups with marcher membership; memberships can be updated with add/remove APIs. */
export async function createLightingGroups({
    db,
    newGroups,
}: {
    db: DbConnection;
    newGroups: NewLightingGroupArgs[];
}): Promise<DatabaseLightingGroup[]> {
    if (newGroups.length === 0) return [];

    return await transactionWithHistory(
        db,
        "createLightingGroups",
        async (tx) => {
            return await createLightingGroupsInTransaction({
                tx,
                newGroups,
            });
        },
    );
}

export async function createLightingGroupsInTransaction({
    tx,
    newGroups,
}: {
    tx: DbTransaction;
    newGroups: NewLightingGroupArgs[];
}): Promise<DatabaseLightingGroup[]> {
    const inserted: DatabaseLightingGroup[] = [];

    for (const raw of newGroups) {
        const { marcher_ids: marcherIds, ...groupRow } = raw;
        await ensureUniqueMarcherIds(marcherIds);

        const [group] = await tx
            .insert(schema.lighting_groups)
            .values(groupRow)
            .returning();
        inserted.push(group);

        const scene_id = group.scene_id;
        if (marcherIds.length > 0) {
            await deleteLightingGroupMembershipsForMarchersInScene({
                tx,
                sceneId: scene_id,
                marcherIds: marcherIds,
            });
            await tx.insert(schema.lighting_group_marchers).values(
                marcherIds.map((marcher_id) => ({
                    group_id: group.id,
                    marcher_id,
                    scene_id,
                })),
            );
        }
    }

    return inserted;
}

export async function addMarchersToLightingGroup({
    db,
    groupId,
    marcherIds,
}: {
    db: DbConnection;
    groupId: number;
    marcherIds: readonly number[];
}): Promise<void> {
    if (marcherIds.length === 0) return;

    return await transactionWithHistory(
        db,
        "addMarchersToLightingGroup",
        async (tx) => {
            await addMarchersToLightingGroupInTransaction({
                tx,
                groupId,
                marcherIds,
            });
        },
    );
}

export async function addMarchersToLightingGroupInTransaction({
    tx,
    groupId,
    marcherIds,
}: {
    tx: DbTransaction;
    groupId: number;
    marcherIds: readonly number[];
}): Promise<void> {
    if (marcherIds.length === 0) return;
    await ensureUniqueMarcherIds(marcherIds);

    const group = await tx.query.lighting_groups.findFirst({
        where: eq(schema.lighting_groups.id, groupId),
    });
    if (!group) throw new Error(`Lighting group ${groupId} was not found.`);

    const scene_id = group.scene_id;
    await deleteLightingGroupMembershipsForMarchersInScene({
        tx,
        sceneId: scene_id,
        marcherIds,
    });

    await tx.insert(schema.lighting_group_marchers).values(
        marcherIds.map((marcher_id) => ({
            group_id: groupId,
            marcher_id,
            scene_id,
        })),
    );
}

export async function removeMarchersFromLightingGroup({
    db,
    groupId,
    marcherIds,
}: {
    db: DbConnection;
    groupId: number;
    marcherIds: readonly number[];
}): Promise<void> {
    if (marcherIds.length === 0) return;

    return await transactionWithHistory(
        db,
        "removeMarchersFromLightingGroup",
        async (tx) => {
            await removeMarchersFromLightingGroupInTransaction({
                tx,
                groupId,
                marcherIds,
            });
        },
    );
}

export async function removeMarchersFromLightingGroupInTransaction({
    tx,
    groupId,
    marcherIds,
}: {
    tx: DbTransaction;
    groupId: number;
    marcherIds: readonly number[];
}): Promise<void> {
    if (marcherIds.length === 0) return;
    const unique = [...new Set(marcherIds)];
    await tx
        .delete(schema.lighting_group_marchers)
        .where(
            and(
                eq(schema.lighting_group_marchers.group_id, groupId),
                inArray(schema.lighting_group_marchers.marcher_id, unique),
            ),
        );
}

export async function deleteLightingGroups({
    db,
    groupIds,
}: {
    db: DbConnection;
    groupIds: Set<number>;
}): Promise<DatabaseLightingGroup[]> {
    if (groupIds.size === 0) return [];

    return await transactionWithHistory(
        db,
        "deleteLightingGroups",
        async (tx) => {
            return await tx
                .delete(schema.lighting_groups)
                .where(inArray(schema.lighting_groups.id, Array.from(groupIds)))
                .returning();
        },
    );
}

export async function updateLightingGroups({
    db,
    modifiedGroups,
}: {
    db: DbConnection;
    modifiedGroups: ModifiedLightingGroupArgs[];
}): Promise<DatabaseLightingGroup[]> {
    if (modifiedGroups.length === 0) return [];

    return await transactionWithHistory(
        db,
        "updateLightingGroups",
        async (tx) => {
            const updated: DatabaseLightingGroup[] = [];
            for (const row of modifiedGroups) {
                const { id, ...fieldUpdatesRest } = row;
                const fieldUpdates = Object.fromEntries(
                    Object.entries(fieldUpdatesRest).filter(
                        ([_, v]) => v !== undefined,
                    ),
                );
                if (Object.keys(fieldUpdates).length === 0) continue;
                const resultRow = await tx
                    .update(schema.lighting_groups)
                    .set(fieldUpdates)
                    .where(eq(schema.lighting_groups.id, id))
                    .returning()
                    .get();
                if (resultRow) updated.push(resultRow);
            }
            return updated;
        },
    );
}

// ============================================================================
// LIGHTING EFFECTS
// ============================================================================

/** Row from `lighting_effects`. */
export type DatabaseLightingEffect =
    typeof schema.lighting_effects.$inferSelect;

export type LightingEffectWithMarchers = DatabaseLightingEffect & {
    marcherIds: Set<number>;
    lighting_group_ids: number[];
};

export type NewLightingEffectArgs = Omit<
    typeof schema.lighting_effects.$inferInsert,
    "id"
> & {
    lighting_group_ids?: readonly number[];
};

export interface ModifiedLightingEffectArgs {
    id: number;
    type?: LightingEffectType;
    args?: string;
    name?: string | null;
    start_offset_beats?: number;
    duration_beats?: number;
    lighting_group_ids?: readonly number[];
}

async function getLightingGroupIdsForEffect({
    db,
    lightingEffectId,
}: {
    db: DbConnection | DbTransaction;
    lightingEffectId: number;
}): Promise<number[]> {
    const links = await db.query.lighting_effect_groups.findMany({
        where: eq(
            schema.lighting_effect_groups.lighting_effect_id,
            lightingEffectId,
        ),
    });
    return links.map((l) => l.lighting_group_id);
}

async function getMarcherIdsForLightingGroupIds({
    db,
    groupIds,
}: {
    db: DbConnection | DbTransaction;
    groupIds: readonly number[];
}): Promise<Set<number>> {
    if (groupIds.length === 0) return new Set();
    const unique = [...new Set(groupIds)];
    const memberships = await db.query.lighting_group_marchers.findMany({
        where: inArray(schema.lighting_group_marchers.group_id, unique),
    });
    return new Set(memberships.map((m) => m.marcher_id));
}

async function replaceLightingEffectGroupsInTransaction({
    tx,
    lightingEffectId,
    groupIds,
}: {
    tx: DbTransaction;
    lightingEffectId: number;
    groupIds: readonly number[];
}): Promise<void> {
    await tx
        .delete(schema.lighting_effect_groups)
        .where(
            eq(
                schema.lighting_effect_groups.lighting_effect_id,
                lightingEffectId,
            ),
        );

    if (groupIds.length === 0) return;

    const unique = [...new Set(groupIds)];
    await tx.insert(schema.lighting_effect_groups).values(
        unique.map((lighting_group_id) => ({
            lighting_effect_id: lightingEffectId,
            lighting_group_id,
        })),
    );
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
        .where(eq(schema.lighting_effects.scene_id, sceneId))
        .orderBy(
            asc(schema.lighting_effects.start_offset_beats),
            asc(schema.lighting_effects.id),
        );
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
    const lighting_group_ids = await getLightingGroupIdsForEffect({
        db,
        lightingEffectId: id,
    });
    const marcherIds = await getMarcherIdsForLightingGroupIds({
        db,
        groupIds: lighting_group_ids,
    });
    return { ...effect, marcherIds, lighting_group_ids };
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
    return await db
        .select()
        .from(schema.lighting_effects)
        .where(eq(schema.lighting_effects.scene_id, sceneId))
        .orderBy(
            asc(schema.lighting_effects.start_offset_beats),
            asc(schema.lighting_effects.id),
        );
}

/**
 * Creates lighting effects. Depends on existing `lighting_scenes.id` and optional `lighting_groups` in that scene.
 */
export async function createLightingEffects({
    db,
    newEffects,
}: {
    db: DbConnection;
    newEffects: NewLightingEffectArgs[];
}): Promise<DatabaseLightingEffect[]> {
    if (newEffects.length === 0) return [];

    return await transactionWithHistory(
        db,
        "createLightingEffects",
        async (tx) => {
            return await createLightingEffectsInTransaction({
                newEffects,
                tx,
            });
        },
    );
}

export async function createLightingEffectsInTransaction({
    newEffects,
    tx,
}: {
    newEffects: NewLightingEffectArgs[];
    tx: DbTransaction;
}): Promise<DatabaseLightingEffect[]> {
    const inserted: DatabaseLightingEffect[] = [];

    for (const raw of newEffects) {
        const { lighting_group_ids: groupIdsInput = [], ...effectFields } = raw;

        const [row] = await tx
            .insert(schema.lighting_effects)
            .values(effectFields)
            .returning();
        inserted.push(row);

        if (groupIdsInput.length === 0) continue;

        await assertLightingGroupIdsBelongToScene({
            tx,
            sceneId: row.scene_id,
            groupIds: groupIdsInput,
        });
        await replaceLightingEffectGroupsInTransaction({
            tx,
            lightingEffectId: row.id,
            groupIds: groupIdsInput,
        });
    }

    return inserted;
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
        const { id, lighting_group_ids: groupIds, ...fieldUpdatesRest } = row;

        const fieldUpdates = Object.fromEntries(
            Object.entries(fieldUpdatesRest).filter(
                ([_, v]) => v !== undefined,
            ),
        );

        let resultRow: DatabaseLightingEffect | undefined;
        if (Object.keys(fieldUpdates).length > 0) {
            resultRow = await tx
                .update(schema.lighting_effects)
                .set(fieldUpdates)
                .where(eq(schema.lighting_effects.id, id))
                .returning()
                .get();
        } else {
            resultRow = await tx.query.lighting_effects.findFirst({
                where: eq(schema.lighting_effects.id, id),
            });
        }

        if (!resultRow)
            throw new Error(`Lighting effect ${id} not found after update.`);

        if (groupIds !== undefined) {
            await assertLightingGroupIdsBelongToScene({
                tx,
                sceneId: resultRow.scene_id,
                groupIds,
            });
            await replaceLightingEffectGroupsInTransaction({
                tx,
                lightingEffectId: id,
                groupIds,
            });
        }

        updated.push(resultRow);
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
