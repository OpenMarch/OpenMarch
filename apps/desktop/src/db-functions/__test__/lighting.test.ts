import { faker } from "@faker-js/faker";
import { asc, eq } from "drizzle-orm";
import { expect } from "vitest";
import {
    addMarchersToLightingGroup,
    createLightingEffects,
    createLightingGroups,
    createLightingScenes,
    deleteLightingEffects,
    deleteLightingGroups,
    deleteLightingScenes,
    getLightingEffectById,
    getLightingEffectIdsBySceneId,
    getLightingEffectWithMarchersById,
    getLightingSceneById,
    getUpcomingLightingSceneInPageId,
    getLightingScenePositionByLightingSceneIdMap,
    getLightingScenesByStartPageId,
    getLightingEffectsBySceneId,
    getLightingGroupMembershipsBySceneId,
    getLightingGroupsBySceneId,
    getMarcherIdsByLightingGroupId,
    removeMarchersFromLightingGroup,
    updateLightingEffects,
    updateLightingScenes,
} from "../lighting";
import {
    getLightingEffectLayersByEffectId,
    replaceLightingEffectLayers,
} from "../lightingEffectLayers";
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
            schema.lighting_groups,
            schema.lighting_group_marchers,
            schema.lighting_effects,
            schema.lighting_effect_groups,
            schema.lighting_effect_layers,
        ]);

        async function createSceneAndGroup({
            db,
            startPageId,
            sceneName = "S",
            groupName = "G",
        }: {
            db: DbTestAPI["db"];
            startPageId: number;
            sceneName?: string;
            groupName?: string;
        }) {
            const [scene] = await createLightingScenes({
                db,
                newScenes: [{ start_page_id: startPageId, name: sceneName }],
            });
            const [group] = await createLightingGroups({
                db,
                newGroups: [
                    {
                        scene_id: scene.id,
                        name: groupName,
                        marcher_ids: [],
                    },
                ],
            });
            return { scene, group };
        }

        it("creates scene → group → effect with group links and reads marchers via groups", async ({
            db,
            marchersAndPages,
        }) => {
            const startPageId = marchersAndPages.expectedPages[0].id;
            const marcherA = marchersAndPages.expectedMarchers[0].id;
            const marcherB = marchersAndPages.expectedMarchers[1].id;

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

            const [group] = await createLightingGroups({
                db,
                newGroups: [
                    {
                        scene_id: scene.id,
                        name: "Pod A",
                        marcher_ids: [marcherA, marcherB],
                    },
                ],
            });

            expect(group.scene_id).toBe(scene.id);

            const groupsInScene = await getLightingGroupsBySceneId({
                db,
                sceneId: scene.id,
            });
            expect(groupsInScene).toHaveLength(1);

            const [effect] = await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        name: "Red",
                        start_offset_beats: 0,
                        duration_beats: 2,
                        lighting_group_ids: [group.id],
                    },
                ],
            });

            expect(effect).toMatchObject({
                scene_id: scene.id,
                type: "solid",
                start_offset_beats: 0,
                duration_beats: 2,
            });

            const withMarchers = await getLightingEffectWithMarchersById({
                db,
                id: effect.id,
            });
            expect(withMarchers?.lighting_group_ids).toEqual([group.id]);
            expect([...withMarchers!.marcherIds].sort((a, b) => a - b)).toEqual(
                [marcherA, marcherB].sort((a, b) => a - b),
            );
        });

        it("moves a marcher when a second group is created with that marcher in the same scene", async ({
            db,
            marchersAndPages,
        }) => {
            const startPageId = marchersAndPages.expectedPages[0].id;
            const marcherId = marchersAndPages.expectedMarchers[0].id;

            const [scene] = await createLightingScenes({
                db,
                newScenes: [{ start_page_id: startPageId, name: "S" }],
            });

            const [g1] = await createLightingGroups({
                db,
                newGroups: [
                    {
                        scene_id: scene.id,
                        name: "G1",
                        marcher_ids: [marcherId],
                    },
                ],
            });

            const [g2] = await createLightingGroups({
                db,
                newGroups: [
                    {
                        scene_id: scene.id,
                        name: "G2",
                        marcher_ids: [marcherId],
                    },
                ],
            });

            expect(
                await getMarcherIdsByLightingGroupId({ db, groupId: g1.id }),
            ).toEqual([]);
            expect(
                await getMarcherIdsByLightingGroupId({ db, groupId: g2.id }),
            ).toEqual([marcherId]);
        });

        it("addMarchersToLightingGroup moves marchers between groups", async ({
            db,
            marchersAndPages,
        }) => {
            const startPageId = marchersAndPages.expectedPages[0].id;
            const mA = marchersAndPages.expectedMarchers[0].id;
            const mB = marchersAndPages.expectedMarchers[1].id;

            const [scene] = await createLightingScenes({
                db,
                newScenes: [{ start_page_id: startPageId, name: "S" }],
            });
            const [g1] = await createLightingGroups({
                db,
                newGroups: [
                    {
                        scene_id: scene.id,
                        name: "G1",
                        marcher_ids: [mA],
                    },
                ],
            });
            const [g2] = await createLightingGroups({
                db,
                newGroups: [
                    {
                        scene_id: scene.id,
                        name: "G2",
                        marcher_ids: [mB],
                    },
                ],
            });

            await addMarchersToLightingGroup({
                db,
                groupId: g2.id,
                marcherIds: [mA, mB],
            });

            expect(
                await getMarcherIdsByLightingGroupId({ db, groupId: g1.id }),
            ).toEqual([]);
            expect(
                (
                    await getMarcherIdsByLightingGroupId({ db, groupId: g2.id })
                ).sort((a, b) => a - b),
            ).toEqual([mA, mB].sort((a, b) => a - b));

            const map = await getLightingGroupMembershipsBySceneId({
                db,
                sceneId: scene.id,
            });
            expect(map.get(g1.id)?.size ?? 0).toBe(0);
            expect([...(map.get(g2.id) ?? [])].sort((a, b) => a - b)).toEqual(
                [mA, mB].sort((a, b) => a - b),
            );
        });

        it("removeMarchersFromLightingGroup clears membership rows", async ({
            db,
            marchersAndPages,
        }) => {
            const startPageId = marchersAndPages.expectedPages[0].id;
            const marcherId = marchersAndPages.expectedMarchers[0].id;

            const [scene] = await createLightingScenes({
                db,
                newScenes: [{ start_page_id: startPageId, name: "S" }],
            });
            const [g1] = await createLightingGroups({
                db,
                newGroups: [
                    {
                        scene_id: scene.id,
                        name: "G1",
                        marcher_ids: [marcherId],
                    },
                ],
            });

            await removeMarchersFromLightingGroup({
                db,
                groupId: g1.id,
                marcherIds: [marcherId],
            });

            expect(
                await getMarcherIdsByLightingGroupId({ db, groupId: g1.id }),
            ).toEqual([]);
        });

        it("returns empty arrays for empty batch creates", async ({ db }) => {
            await expect(
                createLightingScenes({ db, newScenes: [] }),
            ).resolves.toEqual([]);
            await expect(
                createLightingEffects({ db, newEffects: [] }),
            ).resolves.toEqual([]);
            await expect(
                createLightingGroups({ db, newGroups: [] }),
            ).resolves.toEqual([]);
        });

        testWithHistory(
            "update and delete rows with undo/redo coverage",
            async ({ db, marchersAndPages }) => {
                const startPageId = marchersAndPages.expectedPages[1].id;
                const m0 = marchersAndPages.expectedMarchers[0].id;
                const m1 = marchersAndPages.expectedMarchers[1].id;

                const [scene] = await createLightingScenes({
                    db,
                    newScenes: [{ start_page_id: startPageId, name: "A" }],
                });
                const [group] = await createLightingGroups({
                    db,
                    newGroups: [
                        {
                            scene_id: scene.id,
                            name: "G",
                            marcher_ids: [m0],
                        },
                    ],
                });
                const [effect] = await createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: scene.id,
                            type: "fade",
                            args: '{"color":"#000000"}',
                            name: "F",
                            start_offset_beats: 0,
                            duration_beats: 1,
                            lighting_group_ids: [group.id],
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
                        {
                            id: effect.id,
                            type: "strobe",
                            name: "S",
                            start_offset_beats: 3,
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

                expect(updatedScene?.name).toBe("B");
                expect(updatedEffect?.type).toBe("strobe");
                expect(updatedEffect?.start_offset_beats).toBe(3);

                await updateLightingEffects({
                    db,
                    modifiedEffects: [
                        {
                            id: effect.id,
                            lighting_group_ids: [],
                        },
                    ],
                });
                const cleared = await getLightingEffectWithMarchersById({
                    db,
                    id: effect.id,
                });
                expect(cleared?.marcherIds.size).toBe(0);

                const [g2] = await createLightingGroups({
                    db,
                    newGroups: [
                        {
                            scene_id: scene.id,
                            name: "G2",
                            marcher_ids: [m1],
                        },
                    ],
                });
                await updateLightingEffects({
                    db,
                    modifiedEffects: [
                        {
                            id: effect.id,
                            lighting_group_ids: [g2.id],
                        },
                    ],
                });

                await deleteLightingEffects({
                    db,
                    effectIds: new Set([effect.id]),
                });
                await deleteLightingGroups({
                    db,
                    groupIds: new Set([group.id, g2.id]),
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
            },
        );

        it("orders effect ids by start_offset_beats then id", async ({
            db,
            marchersAndPages,
        }) => {
            const startPageId = marchersAndPages.expectedPages[0].id;
            const [scene] = await createLightingScenes({
                db,
                newScenes: [{ start_page_id: startPageId, name: "Seq" }],
            });
            const [first, second] = await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        name: "Later",
                        start_offset_beats: 2,
                        duration_beats: 1,
                    },
                    {
                        scene_id: scene.id,
                        type: "fade",
                        args: "{}",
                        name: "Earlier",
                        start_offset_beats: 0,
                        duration_beats: 1,
                    },
                ],
            });
            await expect(
                getLightingEffectIdsBySceneId({
                    db,
                    sceneId: scene.id,
                }),
            ).resolves.toEqual([second.id, first.id]);
            await expect(
                getLightingEffectsBySceneId({ db, sceneId: scene.id }),
            ).resolves.toEqual([
                expect.objectContaining({
                    id: second.id,
                    start_offset_beats: 0,
                }),
                expect.objectContaining({
                    id: first.id,
                    start_offset_beats: 2,
                }),
            ]);
        });

        it("rejects effect group from another scene", async ({
            db,
            marchersAndPages,
        }) => {
            const p0 = marchersAndPages.expectedPages[0].id;
            const p1 = marchersAndPages.expectedPages[1].id;
            const m = marchersAndPages.expectedMarchers[0].id;

            const [s0] = await createLightingScenes({
                db,
                newScenes: [{ start_page_id: p0, name: "S0" }],
            });
            const [s1] = await createLightingScenes({
                db,
                newScenes: [{ start_page_id: p1, name: "S1" }],
            });
            const [g1] = await createLightingGroups({
                db,
                newGroups: [{ scene_id: s1.id, name: "G", marcher_ids: [m] }],
            });

            await expect(
                createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: s0.id,
                            type: "solid",
                            args: "{}",
                            start_offset_beats: 0,
                            duration_beats: 1,
                            lighting_group_ids: [g1.id],
                        },
                    ],
                }),
            ).rejects.toThrow(/expected/);
        });

        it("rejects creating an effect that overlaps an assigned group", async ({
            db,
            marchersAndPages,
        }) => {
            const { scene, group } = await createSceneAndGroup({
                db,
                startPageId: marchersAndPages.expectedPages[0].id,
            });

            await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        start_offset_beats: 0,
                        duration_beats: 4,
                        lighting_group_ids: [group.id],
                    },
                ],
            });

            await expect(
                createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: scene.id,
                            type: "fade",
                            args: "{}",
                            start_offset_beats: 2,
                            duration_beats: 2,
                            lighting_group_ids: [group.id],
                        },
                    ],
                }),
            ).rejects.toThrow(/already controlled/);
        });

        it("rejects updating start time into an assigned group overlap", async ({
            db,
            marchersAndPages,
        }) => {
            const { scene, group } = await createSceneAndGroup({
                db,
                startPageId: marchersAndPages.expectedPages[0].id,
            });
            const [, second] = await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        start_offset_beats: 0,
                        duration_beats: 4,
                        lighting_group_ids: [group.id],
                    },
                    {
                        scene_id: scene.id,
                        type: "fade",
                        args: "{}",
                        start_offset_beats: 5,
                        duration_beats: 3,
                        lighting_group_ids: [group.id],
                    },
                ],
            });

            await expect(
                updateLightingEffects({
                    db,
                    modifiedEffects: [{ id: second.id, start_offset_beats: 3 }],
                }),
            ).rejects.toThrow(/already controlled/);
        });

        it("allows updating start time when assigned group intervals only touch", async ({
            db,
            marchersAndPages,
        }) => {
            const { scene, group } = await createSceneAndGroup({
                db,
                startPageId: marchersAndPages.expectedPages[0].id,
            });
            const [, second] = await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        start_offset_beats: 0,
                        duration_beats: 4,
                        lighting_group_ids: [group.id],
                    },
                    {
                        scene_id: scene.id,
                        type: "fade",
                        args: "{}",
                        start_offset_beats: 5,
                        duration_beats: 3,
                        lighting_group_ids: [group.id],
                    },
                ],
            });

            const [updated] = await updateLightingEffects({
                db,
                modifiedEffects: [{ id: second.id, start_offset_beats: 4 }],
            });

            expect(updated.start_offset_beats).toBe(4);
        });

        it("rejects updating duration into an assigned group overlap", async ({
            db,
            marchersAndPages,
        }) => {
            const { scene, group } = await createSceneAndGroup({
                db,
                startPageId: marchersAndPages.expectedPages[0].id,
            });
            const [first] = await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        start_offset_beats: 0,
                        duration_beats: 4,
                        lighting_group_ids: [group.id],
                    },
                    {
                        scene_id: scene.id,
                        type: "fade",
                        args: "{}",
                        start_offset_beats: 5,
                        duration_beats: 3,
                        lighting_group_ids: [group.id],
                    },
                ],
            });

            await expect(
                updateLightingEffects({
                    db,
                    modifiedEffects: [{ id: first.id, duration_beats: 6 }],
                }),
            ).rejects.toThrow(/already controlled/);
        });

        it("allows updating duration when assigned group intervals only touch", async ({
            db,
            marchersAndPages,
        }) => {
            const { scene, group } = await createSceneAndGroup({
                db,
                startPageId: marchersAndPages.expectedPages[0].id,
            });
            const [first] = await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        start_offset_beats: 0,
                        duration_beats: 4,
                        lighting_group_ids: [group.id],
                    },
                    {
                        scene_id: scene.id,
                        type: "fade",
                        args: "{}",
                        start_offset_beats: 5,
                        duration_beats: 3,
                        lighting_group_ids: [group.id],
                    },
                ],
            });

            const [updated] = await updateLightingEffects({
                db,
                modifiedEffects: [{ id: first.id, duration_beats: 5 }],
            });

            expect(updated.duration_beats).toBe(5);
        });

        it("rejects assigning a group controlled by an overlapping effect", async ({
            db,
            marchersAndPages,
        }) => {
            const { scene, group } = await createSceneAndGroup({
                db,
                startPageId: marchersAndPages.expectedPages[0].id,
            });
            const [secondGroup] = await createLightingGroups({
                db,
                newGroups: [
                    {
                        scene_id: scene.id,
                        name: "G2",
                        marcher_ids: [],
                    },
                ],
            });
            const [, second] = await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        start_offset_beats: 0,
                        duration_beats: 4,
                        lighting_group_ids: [group.id],
                    },
                    {
                        scene_id: scene.id,
                        type: "fade",
                        args: "{}",
                        start_offset_beats: 2,
                        duration_beats: 4,
                        lighting_group_ids: [secondGroup.id],
                    },
                ],
            });

            await expect(
                updateLightingEffects({
                    db,
                    modifiedEffects: [
                        { id: second.id, lighting_group_ids: [group.id] },
                    ],
                }),
            ).rejects.toThrow(/already controlled/);
        });

        it("allows assigning a shared group when effect intervals do not overlap", async ({
            db,
            marchersAndPages,
        }) => {
            const { scene, group } = await createSceneAndGroup({
                db,
                startPageId: marchersAndPages.expectedPages[0].id,
            });
            const [, second] = await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        start_offset_beats: 0,
                        duration_beats: 4,
                        lighting_group_ids: [group.id],
                    },
                    {
                        scene_id: scene.id,
                        type: "fade",
                        args: "{}",
                        start_offset_beats: 4,
                        duration_beats: 4,
                    },
                ],
            });

            await updateLightingEffects({
                db,
                modifiedEffects: [
                    { id: second.id, lighting_group_ids: [group.id] },
                ],
            });

            const updated = await getLightingEffectWithMarchersById({
                db,
                id: second.id,
            });
            expect(updated?.lighting_group_ids).toEqual([group.id]);
        });

        it("allows batch updates that release and claim a group in one final valid state", async ({
            db,
            marchersAndPages,
        }) => {
            const { scene, group } = await createSceneAndGroup({
                db,
                startPageId: marchersAndPages.expectedPages[0].id,
            });
            const [first, second] = await createLightingEffects({
                db,
                newEffects: [
                    {
                        scene_id: scene.id,
                        type: "solid",
                        args: "{}",
                        start_offset_beats: 0,
                        duration_beats: 4,
                        lighting_group_ids: [group.id],
                    },
                    {
                        scene_id: scene.id,
                        type: "fade",
                        args: "{}",
                        start_offset_beats: 2,
                        duration_beats: 4,
                    },
                ],
            });

            await updateLightingEffects({
                db,
                modifiedEffects: [
                    { id: first.id, lighting_group_ids: [] },
                    { id: second.id, lighting_group_ids: [group.id] },
                ],
            });

            const firstUpdated = await getLightingEffectWithMarchersById({
                db,
                id: first.id,
            });
            const secondUpdated = await getLightingEffectWithMarchersById({
                db,
                id: second.id,
            });
            expect(firstUpdated?.lighting_group_ids).toEqual([]);
            expect(secondUpdated?.lighting_group_ids).toEqual([group.id]);
        });

        it("allows simultaneous group control in different scenes", async ({
            db,
            marchersAndPages,
        }) => {
            const firstScene = await createSceneAndGroup({
                db,
                startPageId: marchersAndPages.expectedPages[0].id,
                sceneName: "S1",
            });
            const secondScene = await createSceneAndGroup({
                db,
                startPageId: marchersAndPages.expectedPages[1].id,
                sceneName: "S2",
            });

            await expect(
                createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: firstScene.scene.id,
                            type: "solid",
                            args: "{}",
                            start_offset_beats: 0,
                            duration_beats: 4,
                            lighting_group_ids: [firstScene.group.id],
                        },
                        {
                            scene_id: secondScene.scene.id,
                            type: "solid",
                            args: "{}",
                            start_offset_beats: 0,
                            duration_beats: 4,
                            lighting_group_ids: [secondScene.group.id],
                        },
                    ],
                }),
            ).resolves.toHaveLength(2);
        });

        describe("lighting effect layers", () => {
            it("creates an effect with layers and reads them back", async ({
                db,
                marchersAndPages,
            }) => {
                const { scene } = await createSceneAndGroup({
                    db,
                    startPageId: marchersAndPages.expectedPages[0].id,
                });

                const [effect] = await createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: scene.id,
                            type: "solid",
                            args: "{}",
                            start_offset_beats: 0,
                            duration_beats: 2,
                            effect_layers: [
                                { top: 0, left: 0, height: 50, width: 40 },
                                { top: 0, left: 40, height: 30, width: 60 },
                            ],
                        },
                    ],
                });

                const withLayers = await getLightingEffectWithMarchersById({
                    db,
                    id: effect.id,
                });
                expect(withLayers?.effect_layers).toHaveLength(2);
                expect(withLayers?.effect_layers).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            lighting_effect_id: effect.id,
                            top: 0,
                            left: 0,
                            height: 50,
                            width: 40,
                        }),
                        expect.objectContaining({
                            lighting_effect_id: effect.id,
                            top: 0,
                            left: 40,
                            height: 30,
                            width: 60,
                        }),
                    ]),
                );
            });

            it("replaces layers on update", async ({
                db,
                marchersAndPages,
            }) => {
                const { scene } = await createSceneAndGroup({
                    db,
                    startPageId: marchersAndPages.expectedPages[0].id,
                });

                const [effect] = await createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: scene.id,
                            type: "solid",
                            args: "{}",
                            start_offset_beats: 0,
                            duration_beats: 2,
                            effect_layers: [
                                { top: 0, left: 0, height: 10, width: 10 },
                            ],
                        },
                    ],
                });

                await updateLightingEffects({
                    db,
                    modifiedEffects: [
                        {
                            id: effect.id,
                            effect_layers: [
                                { top: 5, left: 5, height: 15, width: 25 },
                            ],
                        },
                    ],
                });

                const layers = await getLightingEffectLayersByEffectId({
                    db,
                    lightingEffectId: effect.id,
                });
                expect(layers).toHaveLength(1);
                expect(layers[0]).toMatchObject({
                    top: 5,
                    left: 5,
                    height: 15,
                    width: 25,
                });
            });

            it("cascade-deletes layers when the effect is deleted", async ({
                db,
                marchersAndPages,
            }) => {
                const { scene } = await createSceneAndGroup({
                    db,
                    startPageId: marchersAndPages.expectedPages[0].id,
                });

                const [effect] = await createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: scene.id,
                            type: "solid",
                            args: "{}",
                            start_offset_beats: 0,
                            duration_beats: 2,
                            effect_layers: [
                                { top: 1, left: 2, height: 3, width: 4 },
                            ],
                        },
                    ],
                });

                const beforeDelete = await getLightingEffectLayersByEffectId({
                    db,
                    lightingEffectId: effect.id,
                });
                expect(beforeDelete).toHaveLength(1);

                await deleteLightingEffects({
                    db,
                    effectIds: new Set([effect.id]),
                });

                const afterDelete = await getLightingEffectLayersByEffectId({
                    db,
                    lightingEffectId: effect.id,
                });
                expect(afterDelete).toHaveLength(0);
            });

            testWithHistory(
                "supports undo/redo when replacing layers",
                async ({ db, marchersAndPages }) => {
                    const { scene } = await createSceneAndGroup({
                        db,
                        startPageId: marchersAndPages.expectedPages[0].id,
                    });

                    const [effect] = await createLightingEffects({
                        db,
                        newEffects: [
                            {
                                scene_id: scene.id,
                                type: "solid",
                                args: "{}",
                                start_offset_beats: 0,
                                duration_beats: 2,
                                effect_layers: [
                                    { top: 0, left: 0, height: 10, width: 10 },
                                ],
                            },
                        ],
                    });

                    await replaceLightingEffectLayers({
                        db,
                        lightingEffectId: effect.id,
                        layers: [
                            { top: 100, left: 100, height: 50, width: 50 },
                        ],
                    });

                    const layers = await getLightingEffectLayersByEffectId({
                        db,
                        lightingEffectId: effect.id,
                    });
                    expect(layers).toHaveLength(1);
                    expect(layers[0]).toMatchObject({
                        top: 100,
                        left: 100,
                        height: 50,
                        width: 50,
                    });
                },
            );

            it("rejects creating an effect with overlapping layers", async ({
                db,
                marchersAndPages,
            }) => {
                const { scene } = await createSceneAndGroup({
                    db,
                    startPageId: marchersAndPages.expectedPages[0].id,
                });

                await expect(
                    createLightingEffects({
                        db,
                        newEffects: [
                            {
                                scene_id: scene.id,
                                type: "solid",
                                args: "{}",
                                start_offset_beats: 0,
                                duration_beats: 2,
                                effect_layers: [
                                    { top: 0, left: 0, height: 10, width: 10 },
                                    { top: 5, left: 5, height: 10, width: 10 },
                                ],
                            },
                        ],
                    }),
                ).rejects.toThrow(/effect layers overlap/i);
            });

            it("rejects replacing layers with overlapping rects", async ({
                db,
                marchersAndPages,
            }) => {
                const { scene } = await createSceneAndGroup({
                    db,
                    startPageId: marchersAndPages.expectedPages[0].id,
                });

                const [effect] = await createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: scene.id,
                            type: "solid",
                            args: "{}",
                            start_offset_beats: 0,
                            duration_beats: 2,
                            effect_layers: [
                                { top: 0, left: 0, height: 10, width: 10 },
                            ],
                        },
                    ],
                });

                await expect(
                    replaceLightingEffectLayers({
                        db,
                        lightingEffectId: effect.id,
                        layers: [
                            { top: 0, left: 0, height: 10, width: 10 },
                            { top: 5, left: 5, height: 10, width: 10 },
                        ],
                    }),
                ).rejects.toThrow(/effect layers overlap/i);
            });

            it("rejects updating an effect with overlapping layers", async ({
                db,
                marchersAndPages,
            }) => {
                const { scene } = await createSceneAndGroup({
                    db,
                    startPageId: marchersAndPages.expectedPages[0].id,
                });

                const [effect] = await createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: scene.id,
                            type: "solid",
                            args: "{}",
                            start_offset_beats: 0,
                            duration_beats: 2,
                            effect_layers: [
                                { top: 0, left: 0, height: 10, width: 10 },
                            ],
                        },
                    ],
                });

                await expect(
                    updateLightingEffects({
                        db,
                        modifiedEffects: [
                            {
                                id: effect.id,
                                effect_layers: [
                                    { top: 0, left: 0, height: 10, width: 10 },
                                    { top: 5, left: 5, height: 10, width: 10 },
                                ],
                            },
                        ],
                    }),
                ).rejects.toThrow(/effect layers overlap/i);
            });

            it("allows adjacent non-overlapping layers on replace", async ({
                db,
                marchersAndPages,
            }) => {
                const { scene } = await createSceneAndGroup({
                    db,
                    startPageId: marchersAndPages.expectedPages[0].id,
                });

                const [effect] = await createLightingEffects({
                    db,
                    newEffects: [
                        {
                            scene_id: scene.id,
                            type: "solid",
                            args: "{}",
                            start_offset_beats: 0,
                            duration_beats: 2,
                        },
                    ],
                });

                await replaceLightingEffectLayers({
                    db,
                    lightingEffectId: effect.id,
                    layers: [
                        { top: 0, left: 0, height: 10, width: 10 },
                        { top: 0, left: 10, height: 10, width: 10 },
                    ],
                });

                const layers = await getLightingEffectLayersByEffectId({
                    db,
                    lightingEffectId: effect.id,
                });
                expect(layers).toHaveLength(2);
            });
        });
    });

    describe("getUpcomingLightingSceneInPageId", () => {
        it("returns undefined when there are no lighting scenes", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            const pages = await pagesInTimelineOrder(db);
            expect(pages.length).toBeGreaterThan(0);
            await expect(
                getUpcomingLightingSceneInPageId({
                    db,
                    pageId: pages[0]!.id,
                }),
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

            const result = await getUpcomingLightingSceneInPageId({
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

            const onEarlyPage = await getUpcomingLightingSceneInPageId({
                db,
                pageId: early.id,
            });
            expect(onEarlyPage?.id).toBe(firstScene.id);

            const onMidPage = await getUpcomingLightingSceneInPageId({
                db,
                pageId: mid.id,
            });
            expect(onMidPage?.id).toBe(firstScene.id);

            const onLatePage = await getUpcomingLightingSceneInPageId({
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
                getUpcomingLightingSceneInPageId({ db, pageId: lastPage.id }),
            ).resolves.toBeUndefined();
        });

        it("throws when the page does not exist", async ({
            db,
            marchersAndPages,
        }) => {
            void marchersAndPages;
            await expect(
                getUpcomingLightingSceneInPageId({
                    db,
                    pageId: 9_999_999,
                }),
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
