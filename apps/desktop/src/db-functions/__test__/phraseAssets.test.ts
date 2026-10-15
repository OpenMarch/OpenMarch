import { describe, expect } from "vitest";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import {
    createPhraseAssets,
    deletePhraseAssets,
    getPhraseAssets,
    updatePhraseAssets,
    type NewPhraseAssetArgs,
} from "../phraseAssets";

const toss: NewPhraseAssetArgs = {
    name: "Single toss",
    label: "1x",
    source: "copied_builtin",
    channels: ["horn_equipment"],
    formatVersion: 1,
    data: { stretch: { from: 1, to: 2 }, lengths: [2, 8] },
};

describeDbTests("phraseAssets", (it) => {
    const testWithHistory = getTestWithHistory(it, [schema.phrase_assets]);

    describe("create, update and delete", () => {
        testWithHistory(
            "round-trips the JSON columns and undoes each edit",
            async ({ db, expectNumberOfChanges }) => {
                const [created] = await createPhraseAssets({
                    db,
                    newPhraseAssets: [toss],
                });
                expect(created).toMatchObject(toss);
                expect(await getPhraseAssets({ db })).toEqual([created]);

                const [renamed] = await updatePhraseAssets({
                    db,
                    modifiedPhraseAssets: [
                        {
                            id: created!.id,
                            label: "Toss",
                            channels: ["horn_equipment", "body"],
                        },
                    ],
                });
                expect(renamed).toMatchObject({
                    name: "Single toss",
                    label: "Toss",
                    channels: ["horn_equipment", "body"],
                    data: toss.data,
                });

                await expectNumberOfChanges.test(db, 2);
            },
        );
    });

    describe("deletePhraseAssets", () => {
        testWithHistory(
            "deletes an unused phrase asset",
            async ({ db, expectNumberOfChanges }) => {
                const [a, b] = await createPhraseAssets({
                    db,
                    newPhraseAssets: [toss, { ...toss, name: "Other" }],
                });
                await deletePhraseAssets({
                    db,
                    phraseAssetIds: new Set([a!.id]),
                });
                expect(await getPhraseAssets({ db })).toEqual([b]);
                await expectNumberOfChanges.test(db, 2);
            },
        );
    });

    describe("CHECKs", () => {
        it.for<[string, Partial<NewPhraseAssetArgs>]>([
            ["an unknown source", { source: "drawn" as "posed" }],
            ["format version 0", { formatVersion: 0 }],
            ["data that isn't an object", { data: [] as never }],
        ])("rejects %s", async ([, change], { db }) => {
            await expect(
                createPhraseAssets({
                    db,
                    newPhraseAssets: [{ ...toss, ...change }],
                }),
            ).rejects.toThrow();
            expect(await getPhraseAssets({ db })).toEqual([]);
        });
    });
});
