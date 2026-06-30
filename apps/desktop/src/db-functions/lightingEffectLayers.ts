import { eq, inArray } from "drizzle-orm";
import {
    canLightingEffectTypeHaveLayers,
    LIGHTING_EFFECT_LAYER_UNSUPPORTED_TYPE_ERROR,
} from "@openmarch/core";
import { transactionWithHistory } from "./history";
import { DbConnection, DbTransaction } from "./types";
import { schema } from "@/global/database/db";

/** Row from `lighting_effect_layers`. */
export type DatabaseLightingEffectLayer =
    typeof schema.lighting_effect_layers.$inferSelect;

export type NewLightingEffectLayerArgs = Omit<
    typeof schema.lighting_effect_layers.$inferInsert,
    "id"
>;

export type NewLightingEffectLayerFields = Omit<
    NewLightingEffectLayerArgs,
    "lighting_effect_id"
>;

export interface ModifiedLightingEffectLayerArgs {
    id: number;
    top?: number;
    left?: number;
    height?: number;
    width?: number;
}

export type LightingEffectLayerRect = Pick<
    NewLightingEffectLayerFields,
    "top" | "left" | "height" | "width"
>;

export const LIGHTING_EFFECT_LAYER_OVERLAP_ERROR =
    "Effect layers overlap within lighting effect.";

/** Half-open rect overlap. Zero or negative width/height never overlaps. */
export function lightingEffectLayerRectsOverlap(
    a: LightingEffectLayerRect,
    b: LightingEffectLayerRect,
): boolean {
    if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) {
        return false;
    }
    return (
        a.left < b.left + b.width &&
        b.left < a.left + a.width &&
        a.top < b.top + b.height &&
        b.top < a.top + a.height
    );
}

export function assertLightingEffectLayersDoNotOverlap(
    layers: readonly LightingEffectLayerRect[],
): void {
    for (let i = 0; i < layers.length; i++) {
        for (let j = i + 1; j < layers.length; j++) {
            if (lightingEffectLayerRectsOverlap(layers[i]!, layers[j]!)) {
                throw new Error(LIGHTING_EFFECT_LAYER_OVERLAP_ERROR);
            }
        }
    }
}

async function assertLightingEffectLayersExclusivityForEffect({
    tx,
    lightingEffectId,
    layers,
}: {
    tx: DbTransaction;
    lightingEffectId: number;
    layers: readonly LightingEffectLayerRect[];
}): Promise<void> {
    void lightingEffectId;
    assertLightingEffectLayersDoNotOverlap(layers);
}

async function assertLightingEffectLayersExclusivityAfterCreate({
    tx,
    newLayers,
}: {
    tx: DbTransaction;
    newLayers: readonly NewLightingEffectLayerArgs[];
}): Promise<void> {
    const layersByEffectId = new Map<number, NewLightingEffectLayerArgs[]>();
    for (const layer of newLayers) {
        const existing = layersByEffectId.get(layer.lighting_effect_id);
        if (existing) existing.push(layer);
        else layersByEffectId.set(layer.lighting_effect_id, [layer]);
    }

    for (const [lightingEffectId, layersToAdd] of layersByEffectId) {
        const existingLayers = await getLightingEffectLayersByEffectId({
            db: tx,
            lightingEffectId,
        });
        await assertLightingEffectLayersExclusivityForEffect({
            tx,
            lightingEffectId,
            layers: [...existingLayers, ...layersToAdd],
        });
    }
}

async function assertLightingEffectLayersExclusivityAfterUpdate({
    tx,
    modifiedLayers,
}: {
    tx: DbTransaction;
    modifiedLayers: readonly ModifiedLightingEffectLayerArgs[];
}): Promise<void> {
    if (modifiedLayers.length === 0) return;

    const layerIds = modifiedLayers.map((layer) => layer.id);
    const rows = await tx.query.lighting_effect_layers.findMany({
        where: inArray(schema.lighting_effect_layers.id, layerIds),
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));

    const effectIds = new Set(rows.map((row) => row.lighting_effect_id));
    for (const effectId of effectIds) {
        const existingLayers = await getLightingEffectLayersByEffectId({
            db: tx,
            lightingEffectId: effectId,
        });
        const updatesById = new Map(
            modifiedLayers
                .filter(
                    (layer) =>
                        rowById.get(layer.id)?.lighting_effect_id === effectId,
                )
                .map((layer) => [layer.id, layer] as const),
        );

        const mergedLayers = existingLayers.map((layer) => {
            const update = updatesById.get(layer.id);
            if (!update) return layer;
            return {
                top: update.top ?? layer.top,
                left: update.left ?? layer.left,
                height: update.height ?? layer.height,
                width: update.width ?? layer.width,
            };
        });

        await assertLightingEffectLayersExclusivityForEffect({
            tx,
            lightingEffectId: effectId,
            layers: mergedLayers,
        });
    }
}

export async function getLightingEffectLayersByEffectId({
    db,
    lightingEffectId,
}: {
    db: DbConnection | DbTransaction;
    lightingEffectId: number;
}): Promise<DatabaseLightingEffectLayer[]> {
    return await db.query.lighting_effect_layers.findMany({
        where: eq(
            schema.lighting_effect_layers.lighting_effect_id,
            lightingEffectId,
        ),
    });
}

export const createLightingEffectLayersInTransaction = async ({
    newLayers,
    tx,
}: {
    newLayers: NewLightingEffectLayerArgs[];
    tx: DbTransaction;
}): Promise<DatabaseLightingEffectLayer[]> => {
    if (newLayers.length === 0) return [];

    await assertLightingEffectLayersExclusivityAfterCreate({ tx, newLayers });

    return await tx
        .insert(schema.lighting_effect_layers)
        .values(newLayers)
        .returning();
};

export const updateLightingEffectLayersInTransaction = async ({
    modifiedLayers,
    tx,
}: {
    modifiedLayers: ModifiedLightingEffectLayerArgs[];
    tx: DbTransaction;
}): Promise<DatabaseLightingEffectLayer[]> => {
    if (modifiedLayers.length === 0) return [];

    await assertLightingEffectLayersExclusivityAfterUpdate({
        tx,
        modifiedLayers,
    });

    const updatedLayers: DatabaseLightingEffectLayer[] = [];

    for (const modifiedLayer of modifiedLayers) {
        const { id, ...updateData } = modifiedLayer;
        const fieldUpdates = Object.fromEntries(
            Object.entries(updateData).filter(
                ([_, value]) => value !== undefined,
            ),
        );
        if (Object.keys(fieldUpdates).length === 0) continue;

        const updatedLayer = await tx
            .update(schema.lighting_effect_layers)
            .set(fieldUpdates)
            .where(eq(schema.lighting_effect_layers.id, id))
            .returning()
            .get();
        updatedLayers.push(updatedLayer);
    }

    return updatedLayers;
};

export const deleteLightingEffectLayersInTransaction = async ({
    layerIds,
    tx,
}: {
    layerIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseLightingEffectLayer[]> => {
    if (layerIds.size === 0) return [];

    return await tx
        .delete(schema.lighting_effect_layers)
        .where(inArray(schema.lighting_effect_layers.id, Array.from(layerIds)))
        .returning();
};

export async function replaceLightingEffectLayersInTransaction({
    tx,
    lightingEffectId,
    layers,
}: {
    tx: DbTransaction;
    lightingEffectId: number;
    layers: readonly NewLightingEffectLayerFields[];
}): Promise<DatabaseLightingEffectLayer[]> {
    if (layers.length > 0) {
        const effect = await tx.query.lighting_effects.findFirst({
            where: eq(schema.lighting_effects.id, lightingEffectId),
        });
        if (!effect) {
            throw new Error(`Lighting effect ${lightingEffectId} not found.`);
        }
        if (!canLightingEffectTypeHaveLayers(effect.type)) {
            throw new Error(LIGHTING_EFFECT_LAYER_UNSUPPORTED_TYPE_ERROR);
        }
    }

    await assertLightingEffectLayersExclusivityForEffect({
        tx,
        lightingEffectId,
        layers,
    });

    await tx
        .delete(schema.lighting_effect_layers)
        .where(
            eq(
                schema.lighting_effect_layers.lighting_effect_id,
                lightingEffectId,
            ),
        );

    if (layers.length === 0) return [];

    return await tx
        .insert(schema.lighting_effect_layers)
        .values(
            layers.map((layer) => ({
                ...layer,
                lighting_effect_id: lightingEffectId,
            })),
        )
        .returning();
}

export async function updateLightingEffectLayers({
    db,
    modifiedLayers,
}: {
    db: DbConnection;
    modifiedLayers: ModifiedLightingEffectLayerArgs[];
}): Promise<DatabaseLightingEffectLayer[]> {
    if (modifiedLayers.length === 0) return [];

    return await transactionWithHistory(
        db,
        "updateLightingEffectLayers",
        async (tx) => {
            return await updateLightingEffectLayersInTransaction({
                tx,
                modifiedLayers,
            });
        },
    );
}

export async function deleteLightingEffectLayers({
    db,
    layerIds,
}: {
    db: DbConnection;
    layerIds: Set<number>;
}): Promise<DatabaseLightingEffectLayer[]> {
    if (layerIds.size === 0) return [];

    return await transactionWithHistory(
        db,
        "deleteLightingEffectLayers",
        async (tx) => {
            return await deleteLightingEffectLayersInTransaction({
                tx,
                layerIds,
            });
        },
    );
}

export async function replaceLightingEffectLayers({
    db,
    lightingEffectId,
    layers,
}: {
    db: DbConnection;
    lightingEffectId: number;
    layers: readonly NewLightingEffectLayerFields[];
}): Promise<DatabaseLightingEffectLayer[]> {
    if (layers.length === 0) {
        const existingLayers = await getLightingEffectLayersByEffectId({
            db,
            lightingEffectId,
        });
        if (existingLayers.length === 0) return [];
    }

    return await transactionWithHistory(
        db,
        "replaceLightingEffectLayers",
        async (tx) => {
            return await replaceLightingEffectLayersInTransaction({
                tx,
                lightingEffectId,
                layers,
            });
        },
    );
}
