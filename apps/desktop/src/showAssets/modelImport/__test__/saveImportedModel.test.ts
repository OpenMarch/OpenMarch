import { describe, expect } from "vitest";
import { describeDbTests } from "@/test/base";
import { getShowAsset, readShowAssetBlob } from "@/db-functions/showAssets";
import { parseShowAssetRef } from "@/showAssets/ref";
import { saveImportedModel } from "../saveImportedModel";
import type { ImportedModel } from "../types";

const model = (over: Partial<ImportedModel> = {}): ImportedModel => ({
    name: "Podium",
    parts: {
        model: new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1]),
        distant: new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2]),
        thumbnail: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 3]),
    },
    sidecar: {
        format: "openmarch-model/1",
        importVersion: 1,
        sizeM: { width: 1.2, height: 0.6, depth: 0.9 },
        facing: { front: "+z", turnDeg: 0 },
        plan: {
            outline: [[-600, -450, 600, -450, 600, 450, -600, 450]],
            details: [],
        },
        stand: { atM: [0, 0], topM: 0.6 },
        triangles: 12,
        distantTriangles: 12,
        importNotes: { needsChoice: [], fixedForYou: [], notes: [] },
    },
    credits: { license: "CC0-1.0", author: "Someone" },
    ...over,
});

describeDbTests("saveImportedModel", (it) => {
    describe("saveImportedModel", () => {
        it("stores the model as a `model` asset and names it for items.model", async ({
            db,
        }) => {
            const saved = await saveImportedModel({ db, model: model() });
            expect(saved.added).toBe(true);
            expect(parseShowAssetRef(saved.modelValue)).toEqual(saved.ref);
            const asset = (await getShowAsset({ db, ref: saved.ref }))!;
            expect(asset.kind).toBe("model");
            expect(asset.name).toBe("Podium");
            expect(Object.keys(asset.parts).sort()).toEqual([
                "distant",
                "model",
                "thumbnail",
            ]);
            expect(asset.sidecar).toEqual(model().sidecar);
            expect(asset.credits).toEqual({
                license: "CC0-1.0",
                author: "Someone",
            });
            expect(
                await readShowAssetBlob({ db, hash: asset.parts.thumbnail }),
            ).toEqual(model().parts.thumbnail);
        });

        it("reuses the Version on a re-import, whatever the credits", async ({
            db,
        }) => {
            const first = await saveImportedModel({ db, model: model() });
            const again = await saveImportedModel({
                db,
                model: model({ credits: { author: "Someone else" } }),
            });
            expect(again.added).toBe(false);
            expect(again.ref).toEqual(first.ref);
        });
    });
});
