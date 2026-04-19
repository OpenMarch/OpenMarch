import { faker } from "@faker-js/faker";
import { asc, eq } from "drizzle-orm";
import { expect } from "vitest";
import {
    createLightingEffects,
    createLightingScenes,
    createMarcherLightingEffects,
    deleteLightingEffects,
    deleteLightingScenes,
    deleteMarcherLightingEffects,
    getLightingEffectById,
    getLightingSceneById,
    getLightingSceneInPageId,
    getLightingScenePositionByLightingSceneIdMap,
    getLightingScenesByStartPageId,
    getLightingEffectsBySceneId,
    getMarcherLightingEffectById,
    getMarcherLightingEffectsByLightingEffectId,
    getMarcherLightingEffectsByMarcherId,
    updateLightingEffects,
    updateLightingScenes,
    updateMarcherLightingEffects,
} from "../lighting";
import { describeDbTests, schema, type DbTestAPI } from "@/test/base";
import { getTestWithHistory } from "@/test/history";

/** Pages ordered by timeline (beat position), not primary key id. */
async function pagesInTimelineOrder(db: DbTestAPI["db"]) {
    return db
        .select({
            id: schema.pages.id,
            beatPosition: schema.beats.position,
        })
        .from(schema.pages)
        .innerJoin(schema.beats, eq(schema.pages.start_beat, schema.beats.id))
        .orderBy(asc(schema.beats.position));
}

describeDbTests("lighting", (it) => {
    describe("database interactions", () => {
        const testWithHistory = getTestWithHistory(it, [
            schema.lighting_scenes,
            schema.lighting_effects,
            schema.marcher_lighting_effects,
        ]);

        it("creates scene, effect, and marcher link and reads them back", async ({
            db,
            marchersAndPages,
        }) => {
            const startPageId = marchersAndPages.expectedPages[0].id;
            const marcherId = marchersAndPages.expectedMarchers[0].id;

            const [scene] = await createLightingScenes({
                db,
                newScenes: [
                    {
                        start_page_id: startPageId,
                        name: "Intro wash",
                    },
                ],
            });

            expect(scene).toMatchObject({
                start_page_id: startPageId,
                name: "Intro wash",
            });

            const byPage = await getLightingScenesByStartPageId({
                db,
                startPageId,
            });
            expect(byPage.map((s) => s.id)).toContain(scene.id);

            const [effect] = await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        name: "Red",
                    },
                ],
            });

            expect(effect).toMatchObject({
                scene_id: scene.id,
                type: "solid",
                args: "{}",
                name: "Red",
            });

            const byScene = await getLightingEffectsBySceneId({
                db,
                sceneId: scene.id,
            });
            expect(byScene).toHaveLength(1);
            expect(byScene[0].id).toBe(effect.id);

            const [link] = await createMarcherLightingEffects({
                db,
                newLinks: [
                    {
                        lighting_effect_id: effect.id,
                        marcher_id: marcherId,
                    },
                ],
            });

            expect(link).toMatchObject({
                lighting_effect_id: effect.id,
                marcher_id: marcherId,
            });

            const forEffect = await getMarcherLightingEffectsByLightingEffectId(
                {
                    db,
                    lightingEffectId: effect.id,
                },
            );
            expect(forEffect).toHaveLength(1);

            const forMarcher = await getMarcherLightingEffectsByMarcherId({
                db,
                marcherId,
            });
            expect(forMarcher.some((r) => r.id === link.id)).toBe(true);

            const sceneRow = await getLightingSceneById({ db, id: scene.id });
            const effectRow = await getLightingEffectById({
                db,
                id: effect.id,
            });
            const linkRow = await getMarcherLightingEffectById({
                db,
                id: link.id,
            });

            expect(sceneRow?.id).toBe(scene.id);
            expect(effectRow?.id).toBe(effect.id);
            expect(linkRow?.id).toBe(link.id);
        });

        it("returns empty arrays for empty batch creates", async ({ db }) => {
            await expect(
                createLightingScenes({ db, newScenes: [] }),
            ).resolves.toEqual([]);
            await expect(
                createLightingEffects({ db, newEffects: [] }),
            ).resolves.toEqual([]);
            await expect(
                createMarcherLightingEffects({ db, newLinks: [] }),
            ).resolves.toEqual([]);
        });

        testWithHistory(
            "update and delete rows with undo/redo coverage",
            async ({ db, marchersAndPages }) => {
                const startPageId = marchersAndPages.expectedPages[1].id;
                const marcherId = marchersAndPages.expectedMarchers[1].id;

                const [scene] = await createLightingScenes({
                    db,
                    newScenes: [{ start_page_id: startPageId, name: "A" }],
                });
                const [effect] = await createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: scene.id,
                            type: "fade",
                            args: '{"ms":100}',
                            name: "F",
                        },
                    ],
                });
                const [link] = await createMarcherLightingEffects({
                    db,
                    newLinks: [
                        {
                            lighting_effect_id: effect.id,
                            marcher_id: marcherId,
                        },
                    ],
                });

                await updateLightingScenes({
                    db,
                    modifiedScenes: [{ id: scene.id, name: "B" }],
                });
                await updateLightingEffects({
                    db,
                    modifiedEffects: [
                        { id: effect.id, type: "strobe", name: "S" },
                    ],
                });
                await updateMarcherLightingEffects({
                    db,
                    modifiedLinks: [
                        {
                            id: link.id,
                            marcher_id: marchersAndPages.expectedMarchers[2].id,
                        },
                    ],
                });

                const updatedScene = await getLightingSceneById({
                    db,
                    id: scene.id,
                });
                const updatedEffect = await getLightingEffectById({
                    db,
                    id: effect.id,
                });
                const updatedLink = await getMarcherLightingEffectById({
                    db,
                    id: link.id,
                });

                expect(updatedScene?.name).toBe("B");
                expect(updatedEffect?.type).toBe("strobe");
                expect(updatedLink?.marcher_id).toBe(
                    marchersAndPages.expectedMarchers[2].id,
                );

                await deleteMarcherLightingEffects({
                    db,
                    linkIds: new Set([link.id]),
                });
                await deleteLightingEffects({
                    db,
                    effectIds: new Set([effect.id]),
                });
                await deleteLightingScenes({
                    db,
                    sceneIds: new Set([scene.id]),
                });

                expect(
                    await getLightingSceneById({ db, id: scene.id }),
                ).toBeUndefined();
                expect(
                    await getLightingEffectById({ db, id: effect.id }),
                ).toBeUndefined();
                expect(
                    await getMarcherLightingEffectById({ db, id: link.id }),
                ).toBeUndefined();
            },
        );
    });

    describe("getLightingSceneInPageId", () => {
        it("returns undefined when there are no lighting scenes", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            const pages = await pagesInTimelineOrder(db);
            expect(pages.length).toBeGreaterThan(0);
            await expect(
                getLightingSceneInPageId({ db, pageId: pages[0]!.id }),
            ).resolves.toBeUndefined();
        });

        it("returns the scene when the page is the scene start page", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            const pages = await pagesInTimelineOrder(db);
            expect(pages.length).toBeGreaterThan(0);
            const startPage = pages[Math.floor(pages.length / 2)]!;

            const [scene] = await createLightingScenes({
                db,
                newScenes: [
                    {
                        start_page_id: startPage.id,
                        name: faker.music.songName(),
                    },
                ],
            });

            const result = await getLightingSceneInPageId({
                db,
                pageId: startPage.id,
            });
            expect(result).toMatchObject({
                id: scene.id,
                start_page_id: startPage.id,
            });
        });

        it("picks the earliest scene whose start beat is still >= the page beat", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            const pages = await pagesInTimelineOrder(db);
            expect(pages.length).toBeGreaterThanOrEqual(3);

            const early = pages[0]!;
            const mid = pages[Math.floor(pages.length / 2)]!;
            const late = pages[pages.length - 1]!;

            const [firstScene, secondScene] = await createLightingScenes({
                db,
                newScenes: [
                    {
                        start_page_id: mid.id,
                        name: "Mid scene",
                    },
                    {
                        start_page_id: late.id,
                        name: "Late scene",
                    },
                ],
            });

            const onEarlyPage = await getLightingSceneInPageId({
                db,
                pageId: early.id,
            });
            expect(onEarlyPage?.id).toBe(firstScene.id);

            const onMidPage = await getLightingSceneInPageId({
                db,
                pageId: mid.id,
            });
            expect(onMidPage?.id).toBe(firstScene.id);

            const onLatePage = await getLightingSceneInPageId({
                db,
                pageId: late.id,
            });
            expect(onLatePage?.id).toBe(secondScene.id);
        });

        it("returns undefined when every scene starts before the page", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            const pages = await pagesInTimelineOrder(db);
            expect(pages.length).toBeGreaterThanOrEqual(2);

            const firstPage = pages[0]!;
            const lastPage = pages[pages.length - 1]!;

            await createLightingScenes({
                db,
                newScenes: [
                    {
                        start_page_id: firstPage.id,
                        name: "Only early scene",
                    },
                ],
            });

            await expect(
                getLightingSceneInPageId({ db, pageId: lastPage.id }),
            ).resolves.toBeUndefined();
        });

        it("throws when the page does not exist", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            await expect(
                getLightingSceneInPageId({ db, pageId: 9_999_999 }),
            ).rejects.toThrow(/Page 9999999 not found/);
        });
    });

    describe("getLightingScenePositionByLightingSceneIdMap", () => {
        it("returns an empty object when there are no lighting scenes", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            await expect(
                getLightingScenePositionByLightingSceneIdMap({ db }),
            ).resolves.toEqual({});
        });

        it("maps each scene id to the beat position of its start page", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            const pages = await pagesInTimelineOrder(db);
            expect(pages.length).toBeGreaterThanOrEqual(2);

            const first = pages[0]!;
            const second = pages[1]!;

            const [sceneA, sceneB] = await createLightingScenes({
                db,
                newScenes: [
                    {
                        start_page_id: first.id,
                        name: "A",
                    },
                    {
                        start_page_id: second.id,
                        name: "B",
                    },
                ],
            });

            const map = await getLightingScenePositionByLightingSceneIdMap({
                db,
            });

            expect(map).toEqual({
                [sceneA.id]: first.beatPosition,
                [sceneB.id]: second.beatPosition,
            });
        });

        it("maps correctly when scene row ids are not in timeline order (insert later page first)", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            const pages = await pagesInTimelineOrder(db);
            expect(pages.length).toBeGreaterThanOrEqual(2);

            const earlierPage = pages[0]!;
            const laterPage = pages[1]!;
            expect(earlierPage.beatPosition).toBeLessThan(
                laterPage.beatPosition,
            );

            const [sceneOnLaterPage, sceneOnEarlierPage] =
                await createLightingScenes({
                    db,
                    newScenes: [
                        {
                            start_page_id: laterPage.id,
                            name: "Inserted first, later in show",
                        },
                        {
                            start_page_id: earlierPage.id,
                            name: "Inserted second, earlier in show",
                        },
                    ],
                });

            expect(sceneOnLaterPage.id).toBeLessThan(sceneOnEarlierPage.id);

            const map = await getLightingScenePositionByLightingSceneIdMap({
                db,
            });

            expect(map[sceneOnLaterPage.id]).toBe(laterPage.beatPosition);
            expect(map[sceneOnEarlierPage.id]).toBe(earlierPage.beatPosition);
        });
    });
});
