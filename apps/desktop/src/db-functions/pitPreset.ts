/**
 * Applying a front ensemble preset (instruments.md section 6, "Presets") to the show, in one
 * undo step: its equipment, locked, and the performers who play it.
 *
 * - Re-applying replaces only the items the previous preset created, the ones with
 *   `items.from_preset` set. Renaming or moving one keeps the mark, deleting it drops it, and
 *   undo restores it with the row. Hand-added items are never removed.
 * - The previous preset's players move with it (owner, 2026-11-15: they were left standing inside
 *   the new instruments). A player is a performer of an instrument's section standing on its
 *   playing spot (or a Drum Major on a podium's standing point) at the start of the show. Players
 *   move onto the new preset's spots for their section, left to right; those left over, whose
 *   instruments the new preset doesn't have, are removed, unless they have drill moves, in which
 *   case they stay where they are. Anyone else is never moved or removed. One undo brings it all
 *   back.
 * - Performers are skipped when the show already has them: a section that has N of the preset's
 *   M players gets M - N more, on the spots none of that section stands on.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { XY } from "@openmarch/core";
import { schema } from "@/global/database/db";
import { getSectionObjectByName } from "@/global/classes/Sections";
import { newEquipment, nextEquipmentName } from "@/items/newEquipment";
import type { PitVariant } from "@/view3d/core/pit/catalog";
import { PIXELS_PER_METER } from "@/items/itemOutlines";
import { playingSpotOf } from "@/view3d/core/pit/playingSpot";
import { podiumStandAt } from "@/view3d/core/pit/pitModels";
import { isPodiumFamily, pitVariant } from "@/view3d/core/pit/catalog";
import {
    DRUM_MAJOR_SECTION,
    PIT_PLAYER_SECTIONS,
} from "@/view3d/core/pit/presets";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { createItemsInTransaction, type DatabaseItem } from "./items";
import { createMarchersInTransaction } from "./marcher";
import { updateMarcherHomesInTransaction } from "./marcherHome";
import { removeDeletedMarchersFromTimelinesInTransaction } from "./timelineMarchers";
import { deleteEmptyRecipes, hasShapeRecipes } from "./shapeRecipes";

/** A piece of equipment a preset places, on the canvas */
export interface PitPresetEquipmentArgs {
    variant: PitVariant;
    /** Its family's name; the item is named "<base name> <n>" */
    baseName: string;
    /** Its center, `[x, y]` in canvas coordinates */
    home: XY;
    /** Degrees */
    rotation: number;
}

/** A performer a preset adds, on the canvas */
export interface PitPresetPerformerArgs {
    /** The section's name (`Drum Set`) */
    section: string;
    /** Where they stand, `[x, y]` in canvas coordinates */
    home: XY;
}

type DatabaseMarcher = typeof schema.marchers.$inferSelect;

/**
 * The planned performers the show lacks: per section, as many as the plan has more than the show,
 * on the spots no performer of that section stands within `reach` of first, in plan order.
 */
export function performersToAdd<T extends PitPresetPerformerArgs>(
    planned: readonly T[],
    existing: readonly PitPresetPerformerArgs[],
    reach: number,
): T[] {
    const near = (a: XY, b: XY) =>
        Math.hypot(a[0] - b[0], a[1] - b[1]) <= reach;
    const chosen = new Set<T>();
    for (const section of new Set(planned.map((p) => p.section))) {
        const spots = planned.filter((p) => p.section === section);
        const others = existing.filter((p) => p.section === section);
        const missing = spots.length - others.length;
        if (missing <= 0) continue;
        const taken = (spot: T) =>
            others.some((other) => near(other.home, spot.home));
        const ordered = [
            ...spots.filter((s) => !taken(s)),
            ...spots.filter(taken),
        ];
        for (const spot of ordered.slice(0, missing)) chosen.add(spot);
    }
    return planned.filter((p) => chosen.has(p));
}

/** Where a player of `section` stands at one of the previous preset's items, in canvas units */
export interface PlayerSpot {
    home: XY;
    section: string;
}

/** The section whose performers play or stand on an item of model `model`, or null */
function playerSectionOf(model: string | null): string | null {
    const variant = pitVariant(model);
    if (!variant) return null;
    if (isPodiumFamily(variant.family)) return DRUM_MAJOR_SECTION;
    return PIT_PLAYER_SECTIONS[variant.family] ?? null;
}

/**
 * Where a performer stands to play or stand on each item the previous preset created, at the
 * start of the show, in canvas units, with the section that does: an instrument's playing spot,
 * a podium's standing point.
 */
async function previousPresetSpotsInTransaction(
    tx: DbTransaction,
): Promise<PlayerSpot[]> {
    const rows = await tx
        .select({
            model: schema.items.model,
            x: schema.marchers.home_x,
            y: schema.marchers.home_y,
            itemId: schema.items.id,
        })
        .from(schema.items)
        .innerJoin(
            schema.marchers,
            eq(schema.items.marcher_id, schema.marchers.id),
        )
        .where(eq(schema.items.from_preset, true))
        .all();
    const spots: PlayerSpot[] = [];
    for (const row of rows) {
        const section = playerSectionOf(row.model);
        if (!section) continue;
        // Its first Outline: a locked item has only that one
        const geometry = await tx
            .select({
                depth: schema.item_geometry.depth,
                rotation: schema.item_geometry.rotation,
            })
            .from(schema.item_geometry)
            .where(eq(schema.item_geometry.item_id, row.itemId))
            .orderBy(asc(schema.item_geometry.id))
            .get();
        const rotation = geometry?.rotation ?? 0;
        const spot = playingSpotOf(
            row.model,
            {
                center: { x: row.x, y: row.y },
                depth: geometry?.depth ?? 0,
                rotation,
            },
            PIXELS_PER_METER,
        );
        if (spot) {
            spots.push({ home: [spot.x, spot.y], section });
            continue;
        }
        const standAt = podiumStandAt(row.model);
        if (standAt) {
            const r = (rotation * Math.PI) / 180;
            const dx = standAt.x * PIXELS_PER_METER;
            const dz = standAt.z * PIXELS_PER_METER;
            spots.push({
                home: [
                    row.x + dx * Math.cos(r) - dz * Math.sin(r),
                    row.y + dx * Math.sin(r) + dz * Math.cos(r),
                ],
                section,
            });
        }
    }
    return spots;
}

/** A performer in the show, where they start, and whether they have drill moves */
export type ShowPerformer = PitPresetPerformerArgs & {
    id: number;
    hasMoves: boolean;
};

/**
 * The previous preset's players (performers of an old spot's section standing on it) moved onto
 * the `planned` spots of their section, left to right, as many as there are spots (`moves`); the
 * rest of them, whose instruments the new preset doesn't have, are removed with those instruments
 * (`leftovers`), unless they have drill moves. Everyone else stays where they are.
 */
export function reseatPlayers<T extends PitPresetPerformerArgs>(
    existing: readonly ShowPerformer[],
    oldSpots: readonly PlayerSpot[],
    planned: readonly T[],
    reach: number,
): { moves: { id: number; home: XY }[]; leftovers: number[] } {
    const isPlayer = (p: ShowPerformer) =>
        oldSpots.some(
            (spot) =>
                spot.section === p.section &&
                Math.hypot(
                    p.home[0] - spot.home[0],
                    p.home[1] - spot.home[1],
                ) <= reach,
        );
    const players = existing.filter(isPlayer);
    const moves: { id: number; home: XY }[] = [];
    const leftovers: number[] = [];
    for (const section of new Set(players.map((p) => p.section))) {
        const ofSection = players
            .filter((p) => p.section === section)
            .sort((a, b) => a.home[0] - b.home[0]);
        const spots = planned
            .filter((p) => p.section === section)
            .sort((a, b) => a.home[0] - b.home[0]);
        ofSection.forEach((player, i) => {
            if (i < spots.length)
                moves.push({ id: player.id, home: spots[i].home });
            else if (!player.hasMoves) leftovers.push(player.id);
        });
    }
    return { moves, leftovers };
}

/**
 * Moves the previous preset's players onto this one's spots and removes those left without an
 * instrument (`reseatPlayers`), before counting who is missing; with no performers asked for,
 * nobody is moved or removed. Returns who stays, where they now stand, and who was removed.
 */
async function reseatPlayersInTransaction(
    tx: DbTransaction,
    existing: ShowPerformer[],
    oldSpots: readonly PlayerSpot[],
    performers: readonly PitPresetPerformerArgs[],
    reach: number,
): Promise<{
    staying: ShowPerformer[];
    leftovers: number[];
}> {
    const { moves, leftovers } =
        performers.length > 0
            ? reseatPlayers(existing, oldSpots, performers, reach)
            : { moves: [], leftovers: [] };
    if (moves.length > 0)
        await updateMarcherHomesInTransaction({
            tx,
            modifiedHomes: moves.map(({ id, home }) => ({
                marcherId: id,
                home,
            })),
        });
    await deleteRowsInTransaction(tx, leftovers);
    const moved = new Map(moves.map((m) => [m.id, m.home]));
    const staying = existing
        .filter((p) => !leftovers.includes(p.id))
        .map((p) => ({ ...p, home: moved.get(p.id) ?? p.home }));
    return { staying, leftovers };
}

/** The show's performers, where they start, and whether they have drill moves */
async function showPerformersInTransaction(
    tx: DbTransaction,
): Promise<ShowPerformer[]> {
    // Who has drill moves: a leftover player with moves stays rather than being removed
    const moving = new Set(
        (
            await tx
                .selectDistinct({ id: schema.timeline_assignments.marcher_id })
                .from(schema.timeline_assignments)
                .all()
        ).map((row) => row.id),
    );
    return (
        await tx
            .select()
            .from(schema.marchers)
            .where(eq(schema.marchers.type, "marcher"))
            .all()
    ).map((m) => ({
        id: m.id,
        section: m.section,
        home: [m.home_x, m.home_y] as XY,
        hasMoves: moving.has(m.id),
    }));
}

/** Deletes marchers rows as `deleteMarchers` does: their moves first, then the rows */
async function deleteRowsInTransaction(tx: DbTransaction, ids: number[]) {
    if (ids.length === 0) return;
    await removeDeletedMarchersFromTimelinesInTransaction({
        tx,
        marcherIds: ids,
    });
    await tx
        .delete(schema.marchers)
        .where(inArray(schema.marchers.id, ids))
        .run();
    if (await hasShapeRecipes(tx)) await deleteEmptyRecipes(tx);
}

/** Removes the items the previous preset created, returning their marchers row ids */
async function removePresetItemsInTransaction(
    tx: DbTransaction,
): Promise<number[]> {
    const ids = (
        await tx
            .select({ id: schema.items.marcher_id })
            .from(schema.items)
            .where(eq(schema.items.from_preset, true))
            .all()
    ).map((row) => row.id);
    // Items and Outlines cascade
    await deleteRowsInTransaction(tx, ids);
    return ids;
}

/** Each section's next drill order: one past its prefix's highest */
async function drillOrdersInTransaction(
    tx: DbTransaction,
    sections: readonly string[],
): Promise<{ section: string; drill_prefix: string; drill_order: number }[]> {
    const next = new Map<string, number>();
    const result = [];
    for (const section of sections) {
        const prefix = getSectionObjectByName(section).prefix;
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
        result.push({ section, drill_prefix: prefix, drill_order: order });
    }
    return result;
}

export interface ApplyPitPresetArgs {
    /** The beat its equipment is on field from: the show's first, so it is there all show */
    beatId: number;
    equipment: readonly PitPresetEquipmentArgs[];
    /** The performers to add if missing; none to add no performers */
    performers: readonly PitPresetPerformerArgs[];
    /** How near, in canvas units, a performer must stand to a spot to be on it */
    performerReach: number;
}

export interface AppliedPitPreset {
    items: DatabaseItem[];
    performers: DatabaseMarcher[];
    /** The marchers rows of the previous preset's items it replaced */
    removedMarcherIds: number[];
    /** The previous preset's players whose instruments this one doesn't have, removed with them */
    removedPerformerIds: number[];
}

/** Applies a preset: removes the previous preset's items, adds this one's and its performers */
export async function applyPitPresetInTransaction({
    tx,
    beatId,
    equipment,
    performers,
    performerReach,
}: ApplyPitPresetArgs & { tx: DbTransaction }): Promise<AppliedPitPreset> {
    const oldSpots = await previousPresetSpotsInTransaction(tx);
    const removedMarcherIds = await removePresetItemsInTransaction(tx);

    const names: (string | null)[] = (
        await tx
            .select({ name: schema.marchers.name })
            .from(schema.marchers)
            .where(eq(schema.marchers.type, "item"))
            .all()
    ).map((row) => row.name);
    const newItems = equipment.map(({ variant, baseName, home, rotation }) => {
        const name = nextEquipmentName(baseName, names);
        names.push(name);
        return {
            ...newEquipment({ variant, name, home, beatId, rotation }),
            fromPreset: true,
        };
    });
    const items = await createItemsInTransaction({ tx, newItems });

    const existing = await showPerformersInTransaction(tx);
    const { staying, leftovers } = await reseatPlayersInTransaction(
        tx,
        existing,
        oldSpots,
        performers,
        performerReach,
    );
    const adding = performersToAdd(performers, staying, performerReach);
    const created = await createMarchersInTransaction({
        tx,
        newMarchers: await drillOrdersInTransaction(
            tx,
            adding.map((p) => p.section),
        ),
    });
    if (created.length > 0)
        await updateMarcherHomesInTransaction({
            tx,
            modifiedHomes: created.map((m, i) => ({
                marcherId: m.id,
                home: adding[i].home,
            })),
        });
    const createdPerformers =
        created.length === 0
            ? []
            : await tx
                  .select()
                  .from(schema.marchers)
                  .where(
                      inArray(
                          schema.marchers.id,
                          created.map((m) => m.id),
                      ),
                  )
                  .all();

    return {
        items,
        performers: createdPerformers,
        removedMarcherIds,
        removedPerformerIds: leftovers,
    };
}

/** {@link applyPitPresetInTransaction} as one undo step */
export async function applyPitPreset({
    db,
    ...args
}: ApplyPitPresetArgs & { db: DbConnection }): Promise<AppliedPitPreset> {
    return transactionWithHistory(db, "applyPitPreset", (tx) =>
        applyPitPresetInTransaction({ tx, ...args }),
    );
}
