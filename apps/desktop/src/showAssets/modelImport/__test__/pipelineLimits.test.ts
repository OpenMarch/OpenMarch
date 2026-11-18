// @vitest-environment node
// cspell:words draco precheck
/**
 * The model import's one triangle refusal (fork #1091): past `TRIANGLE_HARD_LIMIT`, before and
 * after decoding. The limit is millions of triangles, too many for a fixture, so these tests
 * lower it to what three SheenChairs pass.
 */
import { describe, expect, it, vi } from "vitest";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { importModel } from "../pipeline";
import { TRIANGLE_CAP } from "../rules";
import type { ModelImportResult, Refusal } from "../types";
import {
    chairWith,
    dracoIo,
    editGlbJson,
    env,
    picked,
    readGlb,
    threeChairs,
} from "./fixtures";

vi.mock("../rules", async (original) => ({
    ...(await original<typeof import("../rules")>()),
    TRIANGLE_HARD_LIMIT: 80_000,
}));

const refusal = (result: ModelImportResult): Refusal | undefined =>
    result.report.cantImport[0];

describe("the triangle hard limit", () => {
    it("refuses past it before decoding", async () => {
        const result = await importModel(
            [picked("three-chairs.glb", await threeChairs())],
            {},
            env,
        );
        expect(refusal(result)).toEqual({
            code: "tooManyTriangles",
            triangles: 119_808,
            cap: TRIANGLE_CAP,
            limit: 80_000,
        });
    });

    it("refuses past it once decoded, whatever the JSON declares", async () => {
        // Three chairs, Draco-compressed, with each accessor claiming 3 elements: the
        // precheck counts 1 triangle per primitive, the decoder makes them all
        const doc = await readGlb(
            await chairWith((d) => {
                const scene = d.getRoot().listScenes()[0];
                const parts = d
                    .getRoot()
                    .listNodes()
                    .filter((n) => n.getMesh());
                for (const dx of [1, 2]) {
                    const copy = d.createNode().setTranslation([dx, 0, 0]);
                    for (const node of parts)
                        copy.addChild(
                            d
                                .createNode()
                                .setMesh(node.getMesh()!.clone())
                                .setMatrix(node.getWorldMatrix()),
                        );
                    scene.addChild(copy);
                }
            }),
        );
        doc.createExtension(KHRDracoMeshCompression)
            .setRequired(true)
            .setEncoderOptions({});
        const encoded = await (await dracoIo()).writeBinary(doc);
        const understated = editGlbJson(encoded, (json) => {
            for (const accessor of json.accessors as { count: number }[])
                accessor.count = 3;
        });
        const result = await importModel(
            [picked("draco-chairs.glb", understated)],
            {},
            env,
        );
        expect(refusal(result)).toEqual({
            code: "tooManyTriangles",
            triangles: 119_808,
            cap: TRIANGLE_CAP,
            limit: 80_000,
        });
    });
});
