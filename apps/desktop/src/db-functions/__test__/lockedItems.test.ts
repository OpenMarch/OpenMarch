import { expect } from "vitest";
import { eq } from "drizzle-orm";
import { createResolver } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { readTimelineTables } from "@/timeline/timelineRows";
import { moveMarchersInTarget } from "../timelineMoves";
import { createItems, updateItems } from "../items";

/**
 * Locked items (props epic step 2, fork #1239): a lock keeps an item from being edited. A canvas
 * edit leaves a locked item where it is; locking and unlocking change nothing else, so an item
 * keeps its moves through both. The show is `marchersAndPages`, converted: page 0 plus pages 1 to
 * 6, 8 counts each.
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
    it("a canvas edit leaves a locked item where it is", async ({
        db,
        marchersAndPages: _,
    }) => {
        const item = await newItem(db, "equipment");
        expect(item.locked).toBe(true);

        for (const target of [
            { kind: "range", start: 1, end: 17 },
            { kind: "home" },
        ] as const)
            await moveMarchersInTarget({
                db,
                target,
                moves: [{ marcherId: item.marcher_id, x: 300, y: 200 }],
            });

        expect(await assignmentsOf(db, item.marcher_id)).toEqual([]);
        await expectOnePosition(db, item.marcher_id, [100, 100]);
    });

    it("a canvas edit of a locked item with moves keeps its moves, in no undo step", async ({
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
        const moved = await assignmentsOf(db, item.marcher_id);
        const steps = async () =>
            (await db.select().from(schema.history_undo).all()).length;
        const before = await steps();

        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 17, end: 25 },
            moves: [{ marcherId: item.marcher_id, x: 50, y: 60 }],
        });

        expect(await assignmentsOf(db, item.marcher_id)).toEqual(moved);
        expect(await steps()).toBe(before);
        expect((await resolverOf(db)).positionAt(item.marcher_id, 25)).toEqual([
            300, 200,
        ]);
    });

    it("an edit of performers and a locked item moves the performers alone", async ({
        db,
        marchersAndPages,
    }) => {
        const item = await newItem(db, "equipment");
        const performer = marchersAndPages.expectedMarchers[0]!.id;

        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 17 },
            moves: [
                { marcherId: performer, x: 40, y: 40 },
                { marcherId: item.marcher_id, x: 300, y: 200 },
            ],
        });

        expect((await resolverOf(db)).positionAt(performer, 17)).toEqual([
            40, 40,
        ]);
        await expectOnePosition(db, item.marcher_id, [100, 100]);
    });

    it("locking keeps the item's moves, and unlocking lets it move again", async ({
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
        const moved = await assignmentsOf(db, item.marcher_id);
        expect(moved).not.toEqual([]);

        await updateItems({
            db,
            modifiedItems: [{ itemId: item.id, locked: true }],
        });
        expect(await assignmentsOf(db, item.marcher_id)).toEqual(moved);
        const locked = await resolverOf(db);
        expect(locked.positionAt(item.marcher_id, 0)).toEqual([100, 100]);
        expect(locked.positionAt(item.marcher_id, 17)).toEqual([300, 200]);

        await updateItems({
            db,
            modifiedItems: [{ itemId: item.id, locked: false }],
        });
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 17, end: 25 },
            moves: [{ marcherId: item.marcher_id, x: 50, y: 60 }],
        });
        const unlocked = await resolverOf(db);
        expect(unlocked.positionAt(item.marcher_id, 17)).toEqual([300, 200]);
        expect(unlocked.positionAt(item.marcher_id, 25)).toEqual([50, 60]);
    });
});
