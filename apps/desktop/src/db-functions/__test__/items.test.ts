import { describe, expect } from "vitest";
import { count, eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { performRedo, performUndo } from "../history";
import { deleteBeats } from "../beat";
import {
    createItems,
    getItemGeometry,
    getItems,
    setItemGeometry,
    updateItems,
    type NewItemArgs,
} from "../items";

const firstBeatIds = async (db: DbConnection) =>
    (
        await db
            .select({ id: schema.beats.id })
            .from(schema.beats)
            .orderBy(schema.beats.position)
            .limit(4)
            .all()
    ).map((b) => b.id);

const riser = (beatId: number): NewItemArgs => ({
    kind: "prop",
    name: "Riser",
    surfaceType: "platform",
    home: [120, 80],
    beatId,
    geometry: {
        outlineType: "rectangle",
        width: 2.4,
        depth: 1.2,
        height: 0.4,
    },
});

const rows = async (db: DbConnection, table: SQLiteTable) =>
    (await db.select({ c: count() }).from(table).get())?.c;

describeDbTests("items", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.marchers,
        schema.items,
        schema.item_geometry,
    ]);

    describe("createItems", () => {
        testWithHistory(
            "creates a prop at home where it was drawn, on field from its count",
            async ({ db, beats }) => {
                expect(beats).toBeDefined();
                const [, beat] = await firstBeatIds(db);

                const [item] = await createItems({
                    db,
                    newItems: [riser(beat)],
                });

                const marcher = await db
                    .select()
                    .from(schema.marchers)
                    .where(eq(schema.marchers.id, item.marcher_id))
                    .get();
                expect(marcher).toMatchObject({
                    type: "item",
                    name: "Riser",
                    section: "Prop",
                    drill_prefix: "PROP",
                    drill_order: 1,
                    home_x: 120,
                    home_y: 80,
                });
                expect(item).toMatchObject({
                    kind: "prop",
                    surface_type: "platform",
                });
                expect(await getItemGeometry({ db })).toEqual([
                    expect.objectContaining({
                        item_id: item.id,
                        beat_id: beat,
                        outline_type: "rectangle",
                        width: 2.4,
                        depth: 1.2,
                        height: 0.4,
                        rotation: 0,
                        transition_length: 1,
                        rolls_out: 0,
                        leading_edge: null,
                    }),
                ]);
            },
        );

        testWithHistory(
            "numbers props and equipment apart, and pins a Library model",
            async ({ db, beats }) => {
                expect(beats).toBeDefined();
                const [beat] = await firstBeatIds(db);
                await createItems({ db, newItems: [riser(beat)] });

                const created = await createItems({
                    db,
                    newItems: [
                        riser(beat),
                        {
                            kind: "equipment",
                            name: "Rifle",
                            home: [0, 0],
                            beatId: beat,
                            geometry: {
                                outlineType: "rectangle",
                                width: 0.1,
                                depth: 1,
                            },
                        },
                    ],
                });

                const items = await getItems({ db });
                expect(
                    items.map((i) => [
                        i.kind,
                        i.marcher.drill_prefix,
                        i.marcher.drill_order,
                    ]),
                ).toEqual([
                    ["prop", "PROP", 1],
                    ["prop", "PROP", 2],
                    ["equipment", "EQUIP", 1],
                ]);
                expect(created[1]).toMatchObject({
                    kind: "equipment",
                    surface_type: null,
                });
            },
        );

        it("undoes a create in one step", async ({ db, beats }) => {
            expect(beats).toBeDefined();
            const [beat] = await firstBeatIds(db);
            const marchersBefore = await rows(db, schema.marchers);
            await createItems({ db, newItems: [riser(beat)] });
            await performUndo(db);
            expect(await rows(db, schema.items)).toBe(0);
            expect(await rows(db, schema.item_geometry)).toBe(0);
            expect(await rows(db, schema.marchers)).toBe(marchersBefore);
        });
    });

    describe("setItemGeometry", () => {
        testWithHistory(
            "adds a change on a new beat and replaces the change on its beat",
            async ({ db, beats }) => {
                expect(beats).toBeDefined();
                const [first, , third] = await firstBeatIds(db);
                const [item] = await createItems({
                    db,
                    newItems: [riser(first)],
                });

                await setItemGeometry({
                    db,
                    itemId: item.id,
                    beatId: third,
                    geometry: {
                        outlineType: "rectangle",
                        width: 4.8,
                        depth: 1.2,
                        transitionLength: 2,
                    },
                });
                await setItemGeometry({
                    db,
                    itemId: item.id,
                    beatId: first,
                    geometry: {
                        outlineType: "circle",
                        width: 1,
                        depth: 1,
                    },
                });

                const geometry = await getItemGeometry({ db });
                expect(
                    geometry.map((g) => [
                        g.beat_id,
                        g.outline_type,
                        g.width,
                        g.transition_length,
                    ]),
                ).toEqual([
                    [first, "circle", 1, 1],
                    [third, "rectangle", 4.8, 2],
                ]);
            },
        );
    });

    describe("updateItems", () => {
        it("clears a Floor prop's roll-out when it stops being a floor", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            const [beat] = await firstBeatIds(db);
            const [item] = await createItems({
                db,
                newItems: [
                    {
                        ...riser(beat!),
                        surfaceType: "floor",
                        geometry: {
                            outlineType: "rectangle",
                            width: 2,
                            depth: 1,
                            rollsOutFrom: "front",
                        },
                    },
                ],
            });
            await updateItems({
                db,
                modifiedItems: [{ itemId: item!.id, surfaceType: "platform" }],
            });
            const [row] = await getItemGeometry({ db });
            expect([row!.rolls_out, row!.leading_edge]).toEqual([0, null]);
        });

        testWithHistory(
            "renames an item and changes a prop's surface in one step",
            async ({ db, beats }) => {
                expect(beats).toBeDefined();
                const [beat] = await firstBeatIds(db);
                const [item] = await createItems({
                    db,
                    newItems: [riser(beat)],
                });

                await updateItems({
                    db,
                    modifiedItems: [
                        {
                            itemId: item.id,
                            name: "Stage",
                            surfaceType: "floor",
                        },
                    ],
                });

                const [updated] = await getItems({ db });
                expect(updated.marcher.name).toBe("Stage");
                expect(updated.surface_type).toBe("floor");
                await performUndo(db);
                const [undone] = await getItems({ db });
                expect(undone.marcher.name).toBe("Riser");
                expect(undone.surface_type).toBe("platform");
            },
        );

        testWithHistory(
            "colors several props in one step, and clears a color",
            async ({ db, beats }) => {
                expect(beats).toBeDefined();
                const [beat] = await firstBeatIds(db);
                const [a, b] = await createItems({
                    db,
                    newItems: [riser(beat), riser(beat)],
                });
                expect(a.color).toBeNull();

                const red = "rgba(220, 38, 38, 1)";
                await updateItems({
                    db,
                    modifiedItems: [
                        { itemId: a.id, color: red },
                        { itemId: b.id, color: red },
                    ],
                });
                expect((await getItems({ db })).map((i) => i.color)).toEqual([
                    red,
                    red,
                ]);
                await performUndo(db);
                expect((await getItems({ db })).map((i) => i.color)).toEqual([
                    null,
                    null,
                ]);

                await updateItems({
                    db,
                    modifiedItems: [{ itemId: a.id, color: red }],
                });
                await updateItems({
                    db,
                    modifiedItems: [{ itemId: a.id, color: null }],
                });
                expect((await getItems({ db }))[0].color).toBeNull();
            },
        );

        it("sets, clears and undoes an item's built-in model", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            const [beat] = await firstBeatIds(db);
            const [riserItem, marimba] = await createItems({
                db,
                newItems: [
                    riser(beat),
                    {
                        kind: "equipment",
                        name: "Marimba",
                        model: "pit/marimba-5.0",
                        home: [0, 0],
                        beatId: beat,
                        geometry: {
                            outlineType: "rectangle",
                            width: 2.6,
                            depth: 1,
                            height: 0.9,
                        },
                    },
                ],
            });
            // A block unless it names a model
            expect(riserItem.model).toBeNull();
            expect(marimba).toMatchObject({
                kind: "equipment",
                surface_type: null,
                model: "pit/marimba-5.0",
            });
            const models = async () =>
                (await getItems({ db })).map((i) => i.model);
            expect(await models()).toEqual([null, "pit/marimba-5.0"]);

            await updateItems({
                db,
                modifiedItems: [
                    { itemId: riserItem.id, model: "pit/vibraphone" },
                    { itemId: marimba.id, model: null },
                ],
            });
            expect(await models()).toEqual(["pit/vibraphone", null]);

            // Changing something else leaves the model alone
            await updateItems({
                db,
                modifiedItems: [{ itemId: riserItem.id, color: "red" }],
            });
            expect(await models()).toEqual(["pit/vibraphone", null]);

            await performUndo(db);
            await performUndo(db);
            expect(await models()).toEqual([null, "pit/marimba-5.0"]);
            await performRedo(db);
            expect(await models()).toEqual(["pit/vibraphone", null]);
        });

        it("resizes every Outline change to a new model's footprint, with the model, in one undo step", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            const [beat, later] = await firstBeatIds(db);
            const [marimba] = await createItems({
                db,
                newItems: [
                    {
                        kind: "equipment",
                        name: "Marimba",
                        model: "pit/marimba-5.0",
                        home: [0, 0],
                        beatId: beat,
                        geometry: {
                            outlineType: "rectangle",
                            width: 2.54,
                            depth: 1.207,
                            height: 0.982,
                            rotation: 15,
                        },
                    },
                ],
            });
            // Turned later in the show: the turn stays, the size follows the model
            await setItemGeometry({
                db,
                itemId: marimba.id,
                beatId: later,
                geometry: {
                    outlineType: "rectangle",
                    width: 2.54,
                    depth: 1.207,
                    height: 0.982,
                    rotation: 90,
                },
            });
            const sizes = async () =>
                (await getItemGeometry({ db })).map((g) => [
                    g.width,
                    g.depth,
                    g.height,
                    g.rotation,
                ]);
            const before = await sizes();

            await updateItems({
                db,
                modifiedItems: [
                    {
                        itemId: marimba.id,
                        model: "pit/marimba-4.3",
                        footprint: {
                            width: 2.129,
                            depth: 0.899,
                            height: 0.982,
                        },
                    },
                ],
            });
            expect(await sizes()).toEqual([
                [2.129, 0.899, 0.982, 15],
                [2.129, 0.899, 0.982, 90],
            ]);
            expect((await getItems({ db }))[0].model).toBe("pit/marimba-4.3");

            await performUndo(db);
            expect(await sizes()).toEqual(before);
            expect((await getItems({ db }))[0].model).toBe("pit/marimba-5.0");
        });

        it("locks equipment by default, and locks and unlocks items in one undo step", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            const [beat] = await firstBeatIds(db);
            const equipment = {
                kind: "equipment" as const,
                home: [0, 0] as [number, number],
                beatId: beat,
                geometry: {
                    outlineType: "rectangle" as const,
                    width: 1,
                    depth: 1,
                    height: 1,
                },
            };
            const [riserItem, speaker, looseCart] = await createItems({
                db,
                newItems: [
                    riser(beat),
                    { ...equipment, name: "Speaker" },
                    { ...equipment, name: "Cart", locked: false },
                ],
            });
            expect(
                [riserItem, speaker, looseCart].map((i) => i.from_preset),
            ).toEqual([false, false, false]);
            expect(riserItem.locked).toBe(false);
            expect(speaker.locked).toBe(true);
            expect(looseCart.locked).toBe(false);
            const locks = async () =>
                (await getItems({ db })).map((i) => i.locked);

            await updateItems({
                db,
                modifiedItems: [
                    { itemId: riserItem.id, locked: true },
                    { itemId: speaker.id, locked: false },
                ],
            });
            expect(await locks()).toEqual([true, false, false]);

            // Changing something else leaves the lock alone
            await updateItems({
                db,
                modifiedItems: [{ itemId: riserItem.id, color: "red" }],
            });
            expect(await locks()).toEqual([true, false, false]);

            await performUndo(db);
            await performUndo(db);
            expect(await locks()).toEqual([false, true, false]);
        });

        it("refuses a surface type on equipment", async ({ db, beats }) => {
            expect(beats).toBeDefined();
            const [beat] = await firstBeatIds(db);
            const [rifle] = await createItems({
                db,
                newItems: [
                    {
                        kind: "equipment",
                        home: [0, 0],
                        beatId: beat,
                        geometry: {
                            outlineType: "rectangle",
                            width: 0.1,
                            depth: 1,
                        },
                    },
                ],
            });
            await expect(
                updateItems({
                    db,
                    modifiedItems: [{ itemId: rifle.id, surfaceType: "floor" }],
                }),
            ).rejects.toThrow(/surface/);
        });
    });

    describe("deleting beats", () => {
        const geometryBeats = async (db: DbConnection) =>
            (await getItemGeometry({ db })).map((g) => g.beat_id);

        it("carries an Outline change on a deleted beat to the next beat, so the item stays on field", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            const [, b1, b2, b3] = await firstBeatIds(db);
            await createItems({ db, newItems: [riser(b1!)] });
            await deleteBeats({ db, beatIds: new Set([b1!, b2!]) });
            expect(await geometryBeats(db)).toEqual([b3]);
            await performUndo(db);
            expect(await geometryBeats(db)).toEqual([b1]);
        });

        it("keeps the change already on the next beat, and the last of a deleted run", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            const [, b1, b2, b3] = await firstBeatIds(db);
            const [item] = await createItems({ db, newItems: [riser(b1!)] });
            await setItemGeometry({
                db,
                itemId: item!.id,
                beatId: b2!,
                geometry: { outlineType: "rectangle", width: 5, depth: 1 },
            });
            await setItemGeometry({
                db,
                itemId: item!.id,
                beatId: b3!,
                geometry: { outlineType: "rectangle", width: 7, depth: 1 },
            });
            await deleteBeats({ db, beatIds: new Set([b1!, b2!]) });
            const rows = await getItemGeometry({ db });
            expect(rows.map((g) => [g.beat_id, g.width])).toEqual([[b3, 7]]);
        });
    });
});
