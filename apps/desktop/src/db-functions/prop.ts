import { eq, isNotNull, sql } from "drizzle-orm";
import { DbConnection, DbTransaction } from "./types";
import { schema } from "@/global/database/db";
import { transactionWithHistory, withTransactionLock } from "./history";
import { createMarchersInTransaction } from "./marcher";
import {
    DatabaseProp,
    DatabasePropPageGeometry,
    DEFAULT_PROP_WIDTH,
    DEFAULT_PROP_HEIGHT,
    SurfaceType,
    ShapeType,
} from "@/global/classes/Prop";

export interface NewPropArgs {
    name: string;
    surface_type?: SurfaceType;
    width?: number;
    height?: number;
    notes?: string | null;
    shape_type?: ShapeType;
    custom_geometry?: string;
    initial_x?: number;
    initial_y?: number;
}

export interface ModifiedPropArgs {
    id: number;
    name?: string | null;
    surface_type?: SurfaceType;
    default_width?: number;
    default_height?: number;
    image_opacity?: number;
}

export interface ModifiedPropPageGeometryArgs {
    id: number;
    width?: number;
    height?: number;
    rotation?: number;
    visible?: boolean;
    shape_type?: ShapeType;
    custom_geometry?: string | null;
}

/** Propagation mode for geometry updates */
export type GeometryPropagation = "current" | "forward" | "all";

export async function getProps({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseProp[]> {
    return await db.select().from(schema.props);
}

export async function getPropsWithMarchers({
    db,
}: {
    db: DbConnection;
}): Promise<
    (DatabaseProp & { marcher: typeof schema.marchers.$inferSelect })[]
> {
    const props = await db
        .select()
        .from(schema.props)
        .innerJoin(
            schema.marchers,
            eq(schema.props.marcher_id, schema.marchers.id),
        );

    return props.map((row) => ({
        ...row.props,
        marcher: row.marchers,
    }));
}

export async function getPropPageGeometry({
    db,
}: {
    db: DbConnection;
}): Promise<DatabasePropPageGeometry[]> {
    return await db.select().from(schema.prop_page_geometry);
}

async function createPropsInTransaction({
    newProps,
    tx,
}: {
    newProps: NewPropArgs[];
    tx: DbTransaction;
}): Promise<DatabaseProp[]> {
    if (newProps.length === 0) return [];

    // Auto-assign drill_orders per prefix from the DB to avoid stale-data races
    const prefixCounters = new Map<string, number>();
    const marcherArgs = [];
    for (const prop of newProps) {
        // Props must always use "PROP" prefix to prevent collision with marcher drill numbers
        const prefix = "PROP";
        if (!prefixCounters.has(prefix)) {
            const result = await tx
                .select({
                    maxOrder: sql<number>`coalesce(max(${schema.marchers.drill_order}), 0)`,
                })
                .from(schema.marchers)
                .where(eq(schema.marchers.drill_prefix, prefix));
            prefixCounters.set(prefix, result[0]?.maxOrder ?? 0);
        }
        const nextOrder = prefixCounters.get(prefix)! + 1;
        prefixCounters.set(prefix, nextOrder);

        marcherArgs.push({
            name: prop.name,
            section: "PROP",
            drill_prefix: prefix,
            drill_order: nextOrder,
            notes: prop.notes,
            type: "prop" as const,
        });
    }

    const createdMarchers = await createMarchersInTransaction({
        newMarchers: marcherArgs,
        tx,
    });

    // Create props records
    const propsToInsert = createdMarchers.map((marcher, i) => ({
        marcher_id: marcher.id,
        surface_type: newProps[i].surface_type ?? "obstacle",
        default_width: newProps[i].width ?? DEFAULT_PROP_WIDTH,
        default_height: newProps[i].height ?? DEFAULT_PROP_HEIGHT,
    }));

    const createdProps = await tx
        .insert(schema.props)
        .values(propsToInsert)
        .returning();

    // Fetch marcher_pages once for all operations
    const marcherPages = await tx.query.marcher_pages.findMany({
        where: (table, { inArray }) =>
            inArray(
                table.marcher_id,
                createdMarchers.map((m) => m.id),
            ),
    });

    if (marcherPages.length === 0) return createdProps;

    // Create prop_page_geometry for each marcher_page
    const geometries = marcherPages.map((mp) => {
        const propIndex = createdMarchers.findIndex(
            (m) => m.id === mp.marcher_id,
        );
        const propArgs = newProps[propIndex];
        return {
            marcher_page_id: mp.id,
            shape_type: propArgs?.shape_type ?? "rectangle",
            width: propArgs?.width ?? DEFAULT_PROP_WIDTH,
            height: propArgs?.height ?? DEFAULT_PROP_HEIGHT,
            custom_geometry: propArgs?.custom_geometry,
        };
    });

    await tx.insert(schema.prop_page_geometry).values(geometries);

    // Update initial positions in batch
    const positionUpdates: { id: number; x?: number; y?: number }[] = [];
    for (let i = 0; i < newProps.length; i++) {
        const propArgs = newProps[i];
        if (
            propArgs.initial_x !== undefined ||
            propArgs.initial_y !== undefined
        ) {
            const relevantMps = marcherPages.filter(
                (mp) => mp.marcher_id === createdMarchers[i].id,
            );
            for (const mp of relevantMps) {
                positionUpdates.push({
                    id: mp.id,
                    x: propArgs.initial_x,
                    y: propArgs.initial_y,
                });
            }
        }
    }

    // Execute position updates
    for (const update of positionUpdates) {
        const setData: { x?: number; y?: number } = {};
        if (update.x !== undefined) setData.x = update.x;
        if (update.y !== undefined) setData.y = update.y;
        if (Object.keys(setData).length > 0) {
            await tx
                .update(schema.marcher_pages)
                .set(setData)
                .where(eq(schema.marcher_pages.id, update.id));
        }
    }

    return createdProps;
}

export async function createProps({
    newProps,
    db,
}: {
    newProps: NewPropArgs[];
    db: DbConnection;
}): Promise<DatabaseProp[]> {
    return await transactionWithHistory(db, "createProps", async (tx) => {
        return await createPropsInTransaction({ newProps, tx });
    });
}

async function updatePropsInTransaction({
    modifiedProps,
    tx,
}: {
    modifiedProps: ModifiedPropArgs[];
    tx: DbTransaction;
}): Promise<DatabaseProp[]> {
    const updated: DatabaseProp[] = [];
    const updatedIds = new Set<number>();
    for (const mod of modifiedProps) {
        const { id, name, ...propData } = mod;

        // Update prop record
        if (Object.keys(propData).length > 0) {
            const result = await tx
                .update(schema.props)
                .set(propData)
                .where(eq(schema.props.id, id))
                .returning()
                .get();
            if (result) {
                updated.push(result);
                updatedIds.add(id);
            }
        }

        // Update marcher name if provided
        if (name !== undefined) {
            const prop = await tx.query.props.findFirst({
                where: (table, { eq: e }) => e(table.id, id),
            });
            if (prop) {
                await tx
                    .update(schema.marchers)
                    .set({ name })
                    .where(eq(schema.marchers.id, prop.marcher_id));

                // Ensure the prop is in the result even if only name changed
                if (!updatedIds.has(id)) {
                    updated.push(prop);
                    updatedIds.add(id);
                }
            }
        }
    }
    return updated;
}

export async function updateProps({
    modifiedProps,
    db,
}: {
    modifiedProps: ModifiedPropArgs[];
    db: DbConnection;
}): Promise<DatabaseProp[]> {
    return await transactionWithHistory(db, "updateProps", async (tx) => {
        return await updatePropsInTransaction({ modifiedProps, tx });
    });
}

export async function updatePropPageGeometry({
    modifiedGeometries,
    db,
}: {
    modifiedGeometries: ModifiedPropPageGeometryArgs[];
    db: DbConnection;
}): Promise<DatabasePropPageGeometry[]> {
    // prop_page_geometry has no undo/redo history triggers, so use
    // withTransactionLock (serialization only) instead of transactionWithHistory.
    return await withTransactionLock(() =>
        db.transaction(async (tx) => {
            const updated: DatabasePropPageGeometry[] = [];
            for (const mod of modifiedGeometries) {
                const { id, ...data } = mod;
                const result = await tx
                    .update(schema.prop_page_geometry)
                    .set(data)
                    .where(eq(schema.prop_page_geometry.id, id))
                    .returning()
                    .get();
                if (result) updated.push(result);
            }
            return updated;
        }),
    );
}

/**
 * Updates prop geometry with propagation control.
 * - "current": Only update the specified geometry (default behavior)
 * - "forward": Update this page and all subsequent pages for the same prop
 * - "all": Update all pages for the same prop
 */
export async function updatePropGeometryWithPropagation({
    propId,
    currentPageId,
    changes,
    propagation,
    db,
}: {
    propId: number;
    currentPageId: number;
    changes: Omit<ModifiedPropPageGeometryArgs, "id">;
    propagation: GeometryPropagation;
    db: DbConnection;
}): Promise<DatabasePropPageGeometry[]> {
    // prop_page_geometry has no undo/redo history triggers, so use
    // withTransactionLock (serialization only) instead of transactionWithHistory.
    return await withTransactionLock(() =>
        db.transaction(async (tx) => {
            const prop = await tx.query.props.findFirst({
                where: (table, { eq: e }) => e(table.id, propId),
            });
            if (!prop) return [];

            const allPages = await tx.query.pages.findMany({
                orderBy: (table, { asc }) => asc(table.start_beat),
            });

            const currentPageIndex = allPages.findIndex(
                (p) => p.id === currentPageId,
            );
            if (currentPageIndex === -1) return [];

            let targetPageIds: number[];
            if (propagation === "current") {
                targetPageIds = [currentPageId];
            } else if (propagation === "forward") {
                targetPageIds = allPages
                    .slice(currentPageIndex)
                    .map((p) => p.id);
            } else {
                targetPageIds = allPages.map((p) => p.id);
            }

            const marcherPages = await tx.query.marcher_pages.findMany({
                where: (table, { and: andOp, eq: eqOp, inArray: inArrayOp }) =>
                    andOp(
                        eqOp(table.marcher_id, prop.marcher_id),
                        inArrayOp(table.page_id, targetPageIds),
                    ),
            });

            const marcherPageIds = marcherPages.map((mp) => mp.id);
            if (marcherPageIds.length === 0) return [];

            const geometries = await tx.query.prop_page_geometry.findMany({
                where: (table, { inArray: inArrayOp }) =>
                    inArrayOp(table.marcher_page_id, marcherPageIds),
            });

            const updated: DatabasePropPageGeometry[] = [];
            for (const geom of geometries) {
                const result = await tx
                    .update(schema.prop_page_geometry)
                    .set(changes)
                    .where(eq(schema.prop_page_geometry.id, geom.id))
                    .returning()
                    .get();
                if (result) updated.push(result);
            }

            return updated;
        }),
    );
}

async function deletePropsInTransaction({
    propIds,
    tx,
}: {
    propIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseProp[]> {
    const deleted: DatabaseProp[] = [];
    for (const propId of propIds) {
        const prop = await tx.query.props.findFirst({
            where: (table, { eq: e }) => e(table.id, propId),
        });
        if (!prop) continue;

        // Delete the marcher (cascades to props, marcher_pages, prop_page_geometry)
        await tx
            .delete(schema.marchers)
            .where(eq(schema.marchers.id, prop.marcher_id));
        deleted.push(prop);
    }
    return deleted;
}

export async function deleteProps({
    propIds,
    db,
}: {
    propIds: Set<number>;
    db: DbConnection;
}): Promise<DatabaseProp[]> {
    return await transactionWithHistory(db, "deleteProps", async (tx) => {
        return await deletePropsInTransaction({ propIds, tx });
    });
}

/** Returns image blobs for all props that have an image set */
export async function getPropImages({
    db,
}: {
    db: DbConnection;
}): Promise<{ prop_id: number; image: Uint8Array }[]> {
    const rows = await db
        .select({ prop_id: schema.props.id, image: schema.props.image })
        .from(schema.props)
        .where(isNotNull(schema.props.image));
    return rows.filter(
        (r): r is { prop_id: number; image: Uint8Array } => r.image !== null,
    );
}

export async function updatePropImage({
    propId,
    image,
    db,
}: {
    propId: number;
    image: Uint8Array;
    db: DbConnection;
}): Promise<void> {
    await transactionWithHistory(db, "updatePropImage", async (tx) => {
        await tx
            .update(schema.props)
            .set({ image })
            .where(eq(schema.props.id, propId));
    });
}

export async function deletePropImage({
    propId,
    db,
}: {
    propId: number;
    db: DbConnection;
}): Promise<void> {
    await transactionWithHistory(db, "deletePropImage", async (tx) => {
        await tx
            .update(schema.props)
            .set({ image: null })
            .where(eq(schema.props.id, propId));
    });
}

export { createPropsInTransaction };
