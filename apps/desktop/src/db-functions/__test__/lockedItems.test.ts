import { expect } from "vitest";
import { eq } from "drizzle-orm";
import { createResolver } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performUndo } from "../history";
import { moveMarchersInTarget } from "../timelineMoves";
import { createItems, updateItems } from "../items";

/**
 * Locked items (instruments.md section 6; ADR 0010 amendment of 2026-11-11): one position for the
 * whole show and no moves. The show is `marchersAndPages`, converted: page 0 plus pages 1 to 6,
 * 8 counts each.
 */

const beatsInOrder = async (db: DbConnection) =>
    db
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(schema.beats.position)
        .all();

const resolverOf = async (db: DbConnection) =>
    createResolver((await readTimelineTables(db)).snapshot);

const assignmentsOf = async (db: DbConnection, marcherId: number) =>
    db
        .select()
        .from(schema.timeline_assignments)
        .where(eq(schema.timeline_assignments.marcher_id, marcherId))
        .all();

const newItem = async (
    db: DbConnection,
    kind: "prop" | "equipment",
    home: [number, number] = [100, 100],
) => {
    const beats = await beatsInOrder(db);
    const [item] = await createItems({
        db,
        newItems: [
            {
                kind,
                ...(kind === "prop" ? { surfaceType: "obstacle" } : {}),
                home,
                beatId: beats[0]!.id,
                geometry: { outlineType: "rectangle", width: 2, depth: 1 },
            },
        ],
    });
    return item!;
};

/** Every beat of the fixture's show, and two past it */
const SHOW_BEATS = [0, 1, 8, 9, 17, 30, 48, 50];

const expectOnePosition = async (
    db: DbConnection,
    marcherId: number,
    at: [number, number],
) => {
    const resolver = await resolverOf(db);
    for (const beat of SHOW_BEATS)
        expect(resolver.positionAt(marcherId, beat)).toEqual(at);
};

describeDbTests("locked items", (it) => {
    it("a drag of a locked item on a later page moves it on every page, with no move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const item = await newItem(db, "equipment");
        expect(item.locked).toBe(true);

        // A canvas drag with the playhead on beat 17, the window over pages 1 and 2
        const result = await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 17 },
            moves: [{ marcherId: item.marcher_id, x: 300, y: 200 }],
        });

        expect(result.homes).toEqual([item.marcher_id]);
        expect(await assignmentsOf(db, item.marcher_id)).toEqual([]);
        await expectOnePosition(db, item.marcher_id, [300, 200]);
    });

    it("a locked item's drag is one undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const item = await newItem(db, "equipment");
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 9, end: 17 },
            moves: [{ marcherId: item.marcher_id, x: 300, y: 200 }],
        });
        await performUndo(db);
        await expectOnePosition(db, item.marcher_id, [100, 100]);
    });

    it("a drag of performers and a locked item moves the performers in the window and the item everywhere", async ({
        db,
        marchersAndPages,
    }) => {
        const item = await newItem(db, "equipment");
        const performer = marchersAndPages.expectedMarchers[0]!.id;
        const performerAtStart = (await resolverOf(db)).positionAt(
            performer,
            0,
        );

        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 17 },
            moves: [
                { marcherId: performer, x: 40, y: 40 },
                { marcherId: item.marcher_id, x: 300, y: 200 },
            ],
        });

        const resolver = await resolverOf(db);
        expect(resolver.positionAt(performer, 0)).toEqual(performerAtStart);
        expect(resolver.positionAt(performer, 17)).toEqual([40, 40]);
        await expectOnePosition(db, item.marcher_id, [300, 200]);
    });

    it("a drag of a locked item with moves left over clears them", async ({
        db,
        marchersAndPages: _,
    }) => {
        // A prop given a move, then locked behind the app's back (an older file, another path)
        const item = await newItem(db, "prop");
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 17 },
            moves: [{ marcherId: item.marcher_id, x: 300, y: 200 }],
        });
        await db
            .update(schema.items)
            .set({ locked: true })
            .where(eq(schema.items.id, item.id))
            .run();

        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 17, end: 25 },
            moves: [{ marcherId: item.marcher_id, x: 50, y: 60 }],
        });

        expect(await assignmentsOf(db, item.marcher_id)).toEqual([]);
        await expectOnePosition(db, item.marcher_id, [50, 60]);
    });

    it("a home drag of a locked item still moves it everywhere", async ({
        db,
        marchersAndPages: _,
    }) => {
        const item = await newItem(db, "equipment");
        await moveMarchersInTarget({
            db,
            target: { kind: "home" },
            moves: [{ marcherId: item.marcher_id, x: 10, y: 20 }],
        });
        await expectOnePosition(db, item.marcher_id, [10, 20]);
    });

    it("locking an item with moves keeps it where it is at the lock's beat, with no moves", async ({
        db,
        marchersAndPages: _,
    }) => {
        const item = await newItem(db, "prop");
        expect(item.locked).toBe(false);
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 17 },
            moves: [{ marcherId: item.marcher_id, x: 300, y: 200 }],
        });

        await updateItems({
            db,
            modifiedItems: [{ itemId: item.id, locked: true, lockAtBeat: 9 }],
        });

        const at9: [number, number] = [200, 150];
        expect(await assignmentsOf(db, item.marcher_id)).toEqual([]);
        await expectOnePosition(db, item.marcher_id, at9);

        // The lock and its new home are one undo step
        await performUndo(db);
        const resolver = await resolverOf(db);
        expect(resolver.positionAt(item.marcher_id, 0)).toEqual([100, 100]);
        expect(resolver.positionAt(item.marcher_id, 17)).toEqual([300, 200]);
        const row = await db
            .select({ locked: schema.items.locked })
            .from(schema.items)
            .where(eq(schema.items.id, item.id))
            .get();
        expect(row?.locked).toBe(false);
    });

    it("locking with no beat keeps the item at its home", async ({
        db,
        marchersAndPages: _,
    }) => {
        const item = await newItem(db, "prop");
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 17 },
            moves: [{ marcherId: item.marcher_id, x: 300, y: 200 }],
        });
        await updateItems({
            db,
            modifiedItems: [{ itemId: item.id, locked: true }],
        });
        await expectOnePosition(db, item.marcher_id, [100, 100]);
    });

    it("unlocking keeps the item where it is and lets it move again", async ({
        db,
        marchersAndPages: _,
    }) => {
        const item = await newItem(db, "equipment");
        await updateItems({
            db,
            modifiedItems: [{ itemId: item.id, locked: false }],
        });
        await expectOnePosition(db, item.marcher_id, [100, 100]);

        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 17 },
            moves: [{ marcherId: item.marcher_id, x: 300, y: 200 }],
        });
        const resolver = await resolverOf(db);
        expect(resolver.positionAt(item.marcher_id, 0)).toEqual([100, 100]);
        expect(resolver.positionAt(item.marcher_id, 17)).toEqual([300, 200]);
    });
});
