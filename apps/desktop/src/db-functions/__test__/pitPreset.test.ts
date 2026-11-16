import { describe, expect, it as plainIt } from "vitest";
import { count, eq, ne } from "drizzle-orm";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { pitVariant } from "@/view3d/core/pit/catalog";
import { performUndo } from "../history";
import { createItems, getItems } from "../items";
import { createMarchers } from "../marcher";
import { PIXELS_PER_METER } from "@/items/itemOutlines";
import { playingSpotOf } from "@/view3d/core/pit/playingSpot";
import {
    applyPitPreset,
    performersToAdd,
    reseatPlayers,
    type PitPresetEquipmentArgs,
    type PitPresetPerformerArgs,
} from "../pitPreset";

const marimba = pitVariant("pit/marimba-5.0")!;
const podium = pitVariant("pit/conductor-podium")!;

const firstBeatId = async (db: DbConnection) =>
    (await db
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(schema.beats.position)
        .get())!.id;

const equipment: PitPresetEquipmentArgs[] = [
    { variant: marimba, baseName: "Marimba", home: [100, 200], rotation: 0 },
    { variant: marimba, baseName: "Marimba", home: [130, 200], rotation: 0 },
    { variant: podium, baseName: "Podium", home: [115, 240], rotation: 0 },
];
const performers: PitPresetPerformerArgs[] = [
    { section: "Marimba", home: [100, 180] },
    { section: "Marimba", home: [130, 180] },
    { section: "Drum Major", home: [115, 240] },
];

const performerRows = (db: DbConnection) =>
    db
        .select()
        .from(schema.marchers)
        .where(ne(schema.marchers.type, "item"))
        .all();

const rows = async (db: DbConnection) =>
    (await db.select({ c: count() }).from(schema.marchers).get())?.c;

describe("performersToAdd", () => {
    const reach = 5;

    plainIt("adds every planned performer to a show without any", () => {
        expect(performersToAdd(performers, [], reach)).toEqual(performers);
    });

    plainIt("adds only the missing ones of a section", () => {
        expect(
            performersToAdd(
                performers,
                [{ section: "Marimba", home: [0, 0] }],
                reach,
            ),
        ).toEqual([performers[0], performers[2]]);
    });

    plainIt(
        "gives the missing ones the spots nobody of their section stands on",
        () => {
            expect(
                performersToAdd(
                    performers,
                    [{ section: "Marimba", home: [101, 181] }],
                    reach,
                ),
            ).toEqual([performers[1], performers[2]]);
            expect(
                performersToAdd(
                    performers,
                    [{ section: "Marimba", home: [129, 179] }],
                    reach,
                ),
            ).toEqual([performers[0], performers[2]]);
        },
    );

    plainIt("adds none of a section that already has enough", () => {
        expect(
            performersToAdd(
                performers,
                [
                    { section: "Drum Major", home: [0, 0] },
                    { section: "Marimba", home: [0, 0] },
                    { section: "Marimba", home: [0, 0] },
                    { section: "Marimba", home: [0, 0] },
                ],
                reach,
            ),
        ).toEqual([]);
    });
});

describe("reseatPlayers", () => {
    const reach = 5;
    const oldSpots = [
        { home: [100, 180] as [number, number], section: "Marimba" },
        { home: [130, 180] as [number, number], section: "Marimba" },
    ];
    const planned = [
        { section: "Marimba", home: [400, 180] as [number, number] },
    ];
    const performer = (
        id: number,
        section: string,
        home: [number, number],
        hasMoves = false,
    ) => ({ id, section, home, hasMoves });

    plainIt(
        "moves players onto the new spots and removes the ones left over",
        () => {
            expect(
                reseatPlayers(
                    [
                        performer(1, "Marimba", [100, 180]),
                        performer(2, "Marimba", [130, 180]),
                    ],
                    oldSpots,
                    planned,
                    reach,
                ),
            ).toEqual({ moves: [{ id: 1, home: [400, 180] }], leftovers: [2] });
        },
    );

    plainIt("keeps a leftover player who has drill moves", () => {
        expect(
            reseatPlayers(
                [
                    performer(1, "Marimba", [100, 180]),
                    performer(2, "Marimba", [130, 180], true),
                ],
                oldSpots,
                planned,
                reach,
            ).leftovers,
        ).toEqual([]);
    });

    plainIt(
        "never touches a performer of another section standing on a spot",
        () => {
            expect(
                reseatPlayers(
                    [performer(3, "Trumpet", [100, 180])],
                    oldSpots,
                    [],
                    reach,
                ),
            ).toEqual({ moves: [], leftovers: [] });
        },
    );
});

describeDbTests("applyPitPreset", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.marchers,
        schema.items,
        schema.item_geometry,
    ]);

    testWithHistory(
        "creates the equipment locked and its performers where planned",
        async ({ db, beats }) => {
            expect(beats).toBeDefined();
            const beatId = await firstBeatId(db);
            const result = await applyPitPreset({
                db,
                beatId,
                equipment,
                performers,
                performerReach: 5,
            });

            const items = await getItems({ db });
            expect(items.map((i) => i.marcher.name)).toEqual([
                "Marimba 1",
                "Marimba 2",
                "Podium 1",
            ]);
            for (const item of items) {
                expect(item.kind).toBe("equipment");
                expect(item.locked).toBe(true);
            }
            expect(items[0].model).toBe("pit/marimba-5.0");
            expect(items[0].marcher).toMatchObject({
                home_x: 100,
                home_y: 200,
            });

            const people = await performerRows(db);
            expect(
                people.map((p) => [
                    p.section,
                    p.drill_prefix,
                    p.home_x,
                    p.home_y,
                ]),
            ).toEqual([
                ["Marimba", "MR", 100, 180],
                ["Marimba", "MR", 130, 180],
                ["Drum Major", "DM", 115, 240],
            ]);
            expect(people.map((p) => p.drill_order)).toEqual([1, 2, 1]);
            expect(result.performers).toHaveLength(3);
        },
    );

    it("applies in one undo step", async ({ db, beats }) => {
        expect(beats).toBeDefined();
        const beatId = await firstBeatId(db);
        const before = await rows(db);
        await applyPitPreset({
            db,
            beatId,
            equipment,
            performers,
            performerReach: 5,
        });
        await performUndo(db);
        expect(await rows(db)).toBe(before);
        expect(await getItems({ db })).toEqual([]);
    });

    it("adds no performers when asked not to", async ({ db, beats }) => {
        expect(beats).toBeDefined();
        await applyPitPreset({
            db,
            beatId: await firstBeatId(db),
            equipment,
            performers: [],
            performerReach: 5,
        });
        expect(await performerRows(db)).toEqual([]);
        expect(await getItems({ db })).toHaveLength(3);
    });

    it("skips performers the show already has, without moving them", async ({
        db,
        beats,
    }) => {
        expect(beats).toBeDefined();
        const [existing] = await createMarchers({
            db,
            newMarchers: [
                { section: "Marimba", drill_prefix: "MR", drill_order: 7 },
            ],
        });
        const before = (await performerRows(db))[0];
        expect(before.id).toBe(existing.id);
        const home = { x: before.home_x, y: before.home_y };
        await applyPitPreset({
            db,
            beatId: await firstBeatId(db),
            equipment,
            performers,
            performerReach: 5,
        });
        const people = await performerRows(db);
        expect(people.filter((p) => p.section === "Marimba")).toHaveLength(2);
        const kept = people.find((p) => p.id === existing.id)!;
        expect({ x: kept.home_x, y: kept.home_y }).toEqual(home);
        // Numbered past the section's highest
        expect(
            people.find((p) => p.section === "Marimba" && p.id !== existing.id)
                ?.drill_order,
        ).toBe(8);
    });

    it("moves the previous preset's players onto the new preset's spots", async ({
        db,
        beats,
    }) => {
        expect(beats).toBeDefined();
        const beatId = await firstBeatId(db);
        const reach = 0.3048 * PIXELS_PER_METER;
        // Each marimba's player stands on its playing spot, as a real preset puts them
        const spotOf = (home: [number, number]): [number, number] => {
            const spot = playingSpotOf(
                marimba.modelId,
                {
                    center: { x: home[0], y: home[1] },
                    depth: marimba.footprint.depth,
                    rotation: 0,
                },
                PIXELS_PER_METER,
            )!;
            return [spot.x, spot.y];
        };
        const layout = (xs: number[]) => ({
            equipment: xs.map(
                (x): PitPresetEquipmentArgs => ({
                    variant: marimba,
                    baseName: "Marimba",
                    home: [x, 300],
                    rotation: 0,
                }),
            ),
            performers: xs.map(
                (x): PitPresetPerformerArgs => ({
                    section: "Marimba",
                    home: spotOf([x, 300]),
                }),
            ),
        });
        await applyPitPreset({
            db,
            beatId,
            ...layout([100, 160]),
            performerReach: reach,
        });
        const first = (await performerRows(db)).map((p) => p.id);
        // A different layout: the same two players move onto its spots, and nobody is added
        const next = layout([400, 470]);
        await applyPitPreset({ db, beatId, ...next, performerReach: reach });
        const people = await performerRows(db);
        expect(people.map((p) => p.id).sort()).toEqual([...first].sort());
        const homes = people
            .map((p) => [p.home_x, p.home_y])
            .sort((a, b) => a[0] - b[0]);
        expect(homes).toEqual(next.performers.map((p) => p.home));
    });

    it("removes the previous preset's players whose instruments the new one doesn't have", async ({
        db,
        beats,
    }) => {
        expect(beats).toBeDefined();
        const beatId = await firstBeatId(db);
        const reach = 0.3048 * PIXELS_PER_METER;
        const spotOf = (x: number): [number, number] => {
            const spot = playingSpotOf(
                marimba.modelId,
                {
                    center: { x, y: 300 },
                    depth: marimba.footprint.depth,
                    rotation: 0,
                },
                PIXELS_PER_METER,
            )!;
            return [spot.x, spot.y];
        };
        const layout = (xs: number[]) => ({
            equipment: xs.map(
                (x): PitPresetEquipmentArgs => ({
                    variant: marimba,
                    baseName: "Marimba",
                    home: [x, 300],
                    rotation: 0,
                }),
            ),
            performers: xs.map(
                (x): PitPresetPerformerArgs => ({
                    section: "Marimba",
                    home: spotOf(x),
                }),
            ),
        });
        await applyPitPreset({
            db,
            beatId,
            ...layout([100, 160, 220]),
            performerReach: reach,
        });
        const result = await applyPitPreset({
            db,
            beatId,
            ...layout([400]),
            performerReach: reach,
        });
        const people = await performerRows(db);
        expect(people).toHaveLength(1);
        expect([people[0].home_x, people[0].home_y]).toEqual(spotOf(400));
        expect(result.removedPerformerIds).toHaveLength(2);
        // One undo brings them back where they were
        await performUndo(db);
        expect(await performerRows(db)).toHaveLength(3);
    });

    it("leaves a player who isn't at the previous preset's instruments where they are", async ({
        db,
        beats,
    }) => {
        expect(beats).toBeDefined();
        const beatId = await firstBeatId(db);
        await createMarchers({
            db,
            newMarchers: [
                { section: "Marimba", drill_prefix: "MR", drill_order: 1 },
            ],
        });
        const roamer = (await performerRows(db))[0];
        await applyPitPreset({
            db,
            beatId,
            equipment,
            performers,
            performerReach: 5,
        });
        await applyPitPreset({
            db,
            beatId,
            equipment,
            performers,
            performerReach: 5,
        });
        const after = (await performerRows(db)).find(
            (p) => p.id === roamer.id,
        )!;
        expect([after.home_x, after.home_y]).toEqual([
            roamer.home_x,
            roamer.home_y,
        ]);
    });

    it("replaces only the items the previous preset created", async ({
        db,
        beats,
    }) => {
        expect(beats).toBeDefined();
        const beatId = await firstBeatId(db);
        const [handAdded] = await createItems({
            db,
            newItems: [
                {
                    kind: "equipment",
                    name: "Marimba 1",
                    model: marimba.modelId,
                    home: [10, 10],
                    beatId,
                    geometry: {
                        outlineType: "rectangle",
                        width: 1,
                        depth: 1,
                    },
                },
            ],
        });
        await applyPitPreset({
            db,
            beatId,
            equipment,
            performers,
            performerReach: 5,
        });
        const first = await getItems({ db });
        expect(first.map((i) => i.marcher.name)).toEqual([
            "Marimba 1",
            "Marimba 2",
            "Marimba 3",
            "Podium 1",
        ]);

        await applyPitPreset({
            db,
            beatId,
            equipment: [equipment[0], equipment[2]],
            performers,
            performerReach: 5,
        });
        const second = await getItems({ db });
        expect(second.map((i) => i.marcher.name)).toEqual([
            "Marimba 1",
            "Marimba 2",
            "Podium 1",
        ]);
        expect(second[0].id).toBe(handAdded.id);
        // The performers stay: the second apply found them all
        expect(await performerRows(db)).toHaveLength(3);

        // Undoing the second apply brings back the first preset's items
        await performUndo(db);
        expect((await getItems({ db })).map((i) => i.id)).toEqual(
            first.map((i) => i.id),
        );
    });

    it("keeps the preset's mark on items through a rename", async ({
        db,
        beats,
    }) => {
        expect(beats).toBeDefined();
        const beatId = await firstBeatId(db);
        await applyPitPreset({
            db,
            beatId,
            equipment,
            performers: [],
            performerReach: 5,
        });
        const [renamed] = await getItems({ db });
        await db
            .update(schema.marchers)
            .set({ name: "Big marimba" })
            .where(eq(schema.marchers.id, renamed.marcher_id))
            .run();
        await applyPitPreset({
            db,
            beatId,
            equipment: [equipment[2]],
            performers: [],
            performerReach: 5,
        });
        expect((await getItems({ db })).map((i) => i.marcher.name)).toEqual([
            "Podium 1",
        ]);
    });
});
