/**
 * Items: props and equipment with their own identity in the show (ADR 0010 D-9 and D-10,
 * props-spec sections 4 and 5).
 *
 * An item is a `marchers` row of type `item`, so the timeline resolver positions it and its moves
 * and undo are inherited, plus an `items` row and its beat-keyed Outline changes in
 * `item_geometry`. Items exist only in timeline mode: in page mode a new marchers row would get
 * `marcher_pages` rows, which items never have.
 */
import { and, eq, sql } from "drizzle-orm";
import type { XY } from "@openmarch/core";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { storedBeatIdInTransaction } from "./endlessCounts";
import { createMarchersInTransaction } from "./marcher";
import { updateMarcherHomesInTransaction } from "./marcherHome";
import { lockItemsInTransaction } from "./lockedItems";

export type DatabaseItem = typeof schema.items.$inferSelect;
export type DatabaseItemGeometry = typeof schema.item_geometry.$inferSelect;
export type ItemKind = (typeof schema.ITEM_KINDS)[number];
export type SurfaceType = (typeof schema.SURFACE_TYPES)[number];
export type OutlineType = (typeof schema.OUTLINE_TYPES)[number];
export type LeadingEdge = (typeof schema.LEADING_EDGES)[number];

/** One Outline change. Sizes in meters, rotation in degrees. */
export interface ItemGeometryArgs {
    outlineType: OutlineType;
    width: number;
    depth: number;
    /** 0 by default: a flat Floor prop */
    height?: number;
    rotation?: number;
    /** JSON points backing a polygon, freehand or arc Outline */
    customOutline?: unknown;
    /** In counts; 1 (instant) by default */
    transitionLength?: number;
    /** Floor props: the edge a roll-out reveals Artwork from, or none */
    rollsOutFrom?: LeadingEdge | null;
}

export interface NewItemArgs {
    kind: ItemKind;
    name?: string | null;
    /** Props only */
    surfaceType?: SurfaceType;
    /** A built-in 3D model id such as `pit/marimba-5.0`; none (a block) by default */
    model?: string | null;
    /** One position for the whole show; equipment is locked and props unlocked by default */
    locked?: boolean;
    /** Placed by a front ensemble preset; false by default */
    fromPreset?: boolean;
    /** Where it was drawn: its home, `[x, y]` in canvas coordinates like a marcher's */
    home: XY;
    /** The beat it was created on: Off field before it, on field from it */
    beatId: number;
    geometry: ItemGeometryArgs;
}

/** Each kind has its own section and drill prefix, apart from every performer's */
const KIND_NUMBERING: Record<ItemKind, { section: string; prefix: string }> = {
    prop: { section: "Prop", prefix: "PROP" },
    equipment: { section: "Equipment", prefix: "EQUIP" },
};

const geometryValues = (geometry: ItemGeometryArgs) => ({
    outline_type: geometry.outlineType,
    width: geometry.width,
    depth: geometry.depth,
    height: geometry.height ?? 0,
    rotation: geometry.rotation ?? 0,
    custom_outline:
        geometry.customOutline === undefined || geometry.customOutline === null
            ? null
            : JSON.stringify(geometry.customOutline),
    transition_length: geometry.transitionLength ?? 1,
    rolls_out: geometry.rollsOutFrom ? 1 : 0,
    leading_edge: geometry.rollsOutFrom ?? null,
});

async function nextDrillOrders(
    tx: DbTransaction,
    newItems: readonly NewItemArgs[],
): Promise<number[]> {
    const next = new Map<string, number>();
    const orders: number[] = [];
    for (const item of newItems) {
        const { prefix } = KIND_NUMBERING[item.kind];
        if (!next.has(prefix)) {
            const row = await tx
                .select({
                    max: sql<number>`coalesce(max(${schema.marchers.drill_order}), 0)`,
                })
                .from(schema.marchers)
                .where(eq(schema.marchers.drill_prefix, prefix))
                .get();
            next.set(prefix, (row?.max ?? 0) + 1);
        }
        const order = next.get(prefix)!;
        next.set(prefix, order + 1);
        orders.push(order);
    }
    return orders;
}

/**
 * Creates items at home where they were drawn, on field from their beat: a marchers row, its
 * home, the item row and its first Outline change.
 */
export async function createItemsInTransaction({
    tx,
    newItems,
}: {
    tx: DbTransaction;
    newItems: readonly NewItemArgs[];
}): Promise<DatabaseItem[]> {
    if (newItems.length === 0) return [];

    const orders = await nextDrillOrders(tx, newItems);
    const marchers = await createMarchersInTransaction({
        tx,
        newMarchers: newItems.map((item, i) => ({
            name: item.name ?? null,
            section: KIND_NUMBERING[item.kind].section,
            drill_prefix: KIND_NUMBERING[item.kind].prefix,
            drill_order: orders[i],
            type: "item",
        })),
    });
    await updateMarcherHomesInTransaction({
        tx,
        modifiedHomes: marchers.map((m, i) => ({
            marcherId: m.id,
            home: newItems[i].home,
        })),
    });

    const items: DatabaseItem[] = [];
    for (const [i, newItem] of newItems.entries()) {
        // Drawn past the stored counts: they are stored up to its beat first (endless counts)
        const beatId = await storedBeatIdInTransaction({
            tx,
            beatId: newItem.beatId,
        });
        const item = await tx
            .insert(schema.items)
            .values({
                marcher_id: marchers[i].id,
                kind: newItem.kind,
                surface_type:
                    newItem.kind === "prop"
                        ? (newItem.surfaceType ?? "obstacle")
                        : null,
                model: newItem.model ?? null,
                locked: newItem.locked ?? newItem.kind === "equipment",
                from_preset: newItem.fromPreset ?? false,
            })
            .returning()
            .get();
        await tx
            .insert(schema.item_geometry)
            .values({
                item_id: item.id,
                beat_id: beatId,
                ...geometryValues(newItem.geometry),
            })
            .run();
        items.push(item);
    }
    return items;
}

export async function createItems({
    db,
    newItems,
}: {
    db: DbConnection;
    newItems: readonly NewItemArgs[];
}): Promise<DatabaseItem[]> {
    return transactionWithHistory(db, "createItems", (tx) =>
        createItemsInTransaction({ tx, newItems }),
    );
}

/**
 * Sets an item's Outline from a beat on: adds a change on that beat, or replaces the one already
 * there. Never touches the item's moves. The beat may be an endless one (`endlessIdOf`), past
 * the stored counts.
 */
export async function setItemGeometryInTransaction({
    tx,
    itemId,
    beatId,
    geometry,
}: {
    tx: DbTransaction;
    itemId: number;
    beatId: number;
    geometry: ItemGeometryArgs;
}): Promise<DatabaseItemGeometry> {
    // Past the stored counts: they are stored up to the beat first (endless counts)
    beatId = await storedBeatIdInTransaction({ tx, beatId });
    const values = geometryValues(geometry);
    const existing = await tx
        .select({ id: schema.item_geometry.id })
        .from(schema.item_geometry)
        .where(
            and(
                eq(schema.item_geometry.item_id, itemId),
                eq(schema.item_geometry.beat_id, beatId),
            ),
        )
        .get();
    // Update in place rather than upsert, so undo restores the same row
    if (existing) {
        return tx
            .update(schema.item_geometry)
            .set(values)
            .where(eq(schema.item_geometry.id, existing.id))
            .returning()
            .get();
    }
    return tx
        .insert(schema.item_geometry)
        .values({ item_id: itemId, beat_id: beatId, ...values })
        .returning()
        .get();
}

export async function setItemGeometry({
    db,
    ...args
}: {
    db: DbConnection;
    itemId: number;
    beatId: number;
    geometry: ItemGeometryArgs;
}): Promise<DatabaseItemGeometry> {
    return transactionWithHistory(db, "setItemGeometry", (tx) =>
        setItemGeometryInTransaction({ tx, ...args }),
    );
}

/** Every item with its marchers row, in creation order. */
export async function getItems({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<
    (DatabaseItem & { marcher: typeof schema.marchers.$inferSelect })[]
> {
    const rows = await db
        .select()
        .from(schema.items)
        .innerJoin(
            schema.marchers,
            eq(schema.items.marcher_id, schema.marchers.id),
        )
        .orderBy(schema.items.id)
        .all();
    return rows.map((row) => ({ ...row.items, marcher: row.marchers }));
}

/** Every Outline change, by item and then beat order. */
export async function getItemGeometry({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<DatabaseItemGeometry[]> {
    return db
        .select({ geometry: schema.item_geometry })
        .from(schema.item_geometry)
        .innerJoin(
            schema.beats,
            eq(schema.item_geometry.beat_id, schema.beats.id),
        )
        .orderBy(schema.item_geometry.item_id, schema.beats.position)
        .all()
        .then((rows) => rows.map((r) => r.geometry));
}

export interface ModifiedItemArgs {
    itemId: number;
    /** The item's name, on its marchers row; null clears it */
    name?: string | null;
    /** Props only */
    surfaceType?: SurfaceType;
    /** The prop's color as `rgba(r, g, b, a)` (`propColorToString`); null clears it */
    color?: string | null;
    /** A built-in 3D model id such as `pit/marimba-5.0`; null draws the item as a block */
    model?: string | null;
    /**
     * Locks the item to one position for the whole show, or unlocks it. Locking clears its moves
     * and keeps it where it is at `lockAtBeat` (`lockItemsInTransaction`)
     */
    locked?: boolean;
    /** The beat a lock keeps the item's position from: the playhead. 0 (its home) by default */
    lockAtBeat?: number;
    /**
     * Sizes every Outline change of the item to this, in meters, keeping their turns: a new
     * model's footprint, set with `model`
     */
    footprint?: { width: number; depth: number; height: number };
}

/**
 * Renames items, changes props' surface types and colors, sets items' models and locks, and
 * resizes them to a model's footprint.
 */
export async function updateItemsInTransaction({
    tx,
    modifiedItems,
}: {
    tx: DbTransaction;
    modifiedItems: readonly ModifiedItemArgs[];
}): Promise<void> {
    for (const {
        itemId,
        name,
        surfaceType,
        color,
        model,
        locked,
        lockAtBeat,
        footprint,
    } of modifiedItems) {
        const item = await tx
            .select()
            .from(schema.items)
            .where(eq(schema.items.id, itemId))
            .get();
        if (!item) throw new Error(`No item with id ${itemId}`);
        if (name !== undefined)
            await tx
                .update(schema.marchers)
                .set({ name })
                .where(eq(schema.marchers.id, item.marcher_id))
                .run();
        // Locking an unlocked item gives it one position first, from the moves it has now
        if (locked === true && !item.locked)
            await lockItemsInTransaction(tx, [item.marcher_id], lockAtBeat);
        if (color !== undefined || model !== undefined || locked !== undefined)
            await tx
                .update(schema.items)
                .set({ color, model, locked })
                .where(eq(schema.items.id, itemId))
                .run();
        if (footprint !== undefined)
            await tx
                .update(schema.item_geometry)
                .set({
                    width: footprint.width,
                    depth: footprint.depth,
                    height: footprint.height,
                })
                .where(eq(schema.item_geometry.item_id, itemId))
                .run();
        if (surfaceType !== undefined) {
            if (item.kind !== "prop")
                throw new Error("Only props have a surface type");
            await tx
                .update(schema.items)
                .set({ surface_type: surfaceType })
                .where(eq(schema.items.id, itemId))
                .run();
            // Only a Floor prop rolls out: a platform or obstacle drops it at every count
            if (surfaceType !== "floor")
                await tx
                    .update(schema.item_geometry)
                    .set({ rolls_out: 0, leading_edge: null })
                    .where(
                        and(
                            eq(schema.item_geometry.item_id, itemId),
                            eq(schema.item_geometry.rolls_out, 1),
                        ),
                    )
                    .run();
        }
    }
}

/** `updateItemsInTransaction` as one undo step. */
export async function updateItems({
    db,
    modifiedItems,
}: {
    db: DbConnection;
    modifiedItems: readonly ModifiedItemArgs[];
}): Promise<void> {
    if (modifiedItems.length === 0) return;
    await transactionWithHistory(db, "updateItems", (tx) =>
        updateItemsInTransaction({ tx, modifiedItems }),
    );
}
