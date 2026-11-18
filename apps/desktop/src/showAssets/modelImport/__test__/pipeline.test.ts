// cspell:words Mackey nendsolid precheck
// @vitest-environment node
// cspell:words basisu draco ktx
/**
 * The model import step on real-world files (fork #998, "Tests"): each fixture with its outcome.
 * Texture shrinking runs on a stand-in codec here; the browser end-to-end test runs the real one
 * in the worker.
 */
import { describe, expect, it } from "vitest";
import { getBounds } from "@gltf-transform/functions";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { validateBytes } from "gltf-validator";
import { importModel } from "../pipeline";
import { readImageHeader } from "../imageSize";
import { tipped, UPRIGHT, Z_UP_TILT } from "../orientation";
import { TRIANGLE_CAP } from "../rules";
import type {
    ModelImportChoices,
    ModelImportResult,
    PickedFile,
    Refusal,
} from "../types";
import {
    chairWith,
    dracoIo,
    editGlbJson,
    env,
    ktx2Header,
    picked,
    pngHeaderOnly,
    postGlb,
    read,
    readGlb,
    separateGltf,
    solidPng,
    wrapRoots,
} from "./fixtures";

const run = (files: PickedFile[], choices: ModelImportChoices = {}) =>
    importModel(files, choices, env);

function imported(result: ModelImportResult) {
    if (!result.ok)
        throw new Error(`refused: ${JSON.stringify(result.report.cantImport)}`);
    return result.model;
}

function refusal(result: ModelImportResult): Refusal {
    expect(result.ok).toBe(false);
    expect(result.report.cantImport).toHaveLength(1);
    return result.report.cantImport[0];
}

/** The stored GLB, checked: valid, plain, standing on the ground at the middle of its footprint */
async function checkStored(glb: Uint8Array) {
    const report = await validateBytes(glb, { maxIssues: 0 });
    expect(report.issues.messages.filter((m) => m.severity === 0)).toEqual([]);
    const doc = await readGlb(glb);
    const used = doc
        .getRoot()
        .listExtensionsUsed()
        .map((e) => e.extensionName);
    for (const ext of used)
        expect(["KHR_texture_transform", "KHR_materials_unlit"]).toContain(ext);
    const { min, max } = getBounds(doc.getRoot().listScenes()[0]);
    expect(min[1]).toBeCloseTo(0, 4);
    expect((min[0] + max[0]) / 2).toBeCloseTo(0, 4);
    expect((min[2] + max[2]) / 2).toBeCloseTo(0, 4);
    return { doc, min, max };
}

const choiceOf = <C extends string>(result: ModelImportResult, code: C) =>
    result.report.needsChoice.find((c) => c.code === code) as
        | Extract<
              ModelImportResult["report"]["needsChoice"][number],
              { code: C }
          >
        | undefined;

describe("importModel", () => {
    describe("a good file (TextureCoordinateTest)", () => {
        it("imports with nothing to choose but the tilt and the turn", async () => {
            const result = await run([picked("TextureCoordinateTest.glb")]);
            const model = imported(result);
            expect(result.report.needsChoice.map((c) => c.code)).toEqual([
                "tilt",
                "turn",
            ]);
            expect(result.report.cantImport).toEqual([]);
            await checkStored(model.parts.model);
            await checkStored(model.parts.distant);
            expect(model.name).toBe("TextureCoordinateTest");
            expect(model.sidecar.format).toBe("openmarch-model/1");
            expect(model.sidecar.facing).toEqual({ front: "+z", turnDeg: 0 });
            expect(model.sidecar.triangles).toBe(10);
            expect(model.sidecar.plan.outline.length).toBeGreaterThan(0);
        });

        it("makes a 256 px PNG thumbnail", async () => {
            const model = imported(
                await run([picked("TextureCoordinateTest.glb")]),
            );
            expect(readImageHeader(model.parts.thumbnail)).toEqual({
                mimeType: "image/png",
                width: 256,
                height: 256,
            });
        });

        it("prefills credits from asset.copyright", async () => {
            const model = imported(
                await run([picked("TextureCoordinateTest.glb")]),
            );
            expect(model.credits).toEqual({
                license: "CC-BY-4.0",
                attribution:
                    "Copyright 2017-2018 Analytical Graphics, Inc., CC-BY 4.0 https://creativecommons.org/licenses/by/4.0/ - Mesh and textures by Ed Mackey.",
            });
        });

        it("gives the same bytes for the same file and choices", async () => {
            const a = imported(await run([picked("SheenChair.glb")]));
            const b = imported(await run([picked("SheenChair.glb")]));
            expect(b.parts).toEqual(a.parts);
            expect(b.sidecar).toEqual(a.sidecar);
        });
    });

    describe("a real chair over the triangle cap (SheenChair)", () => {
        it("simplifies under the cap by default, with a distant version", async () => {
            const result = await run([picked("SheenChair.glb")]);
            const model = imported(result);
            const simplify = choiceOf(result, "simplify")!;
            expect(simplify).toMatchObject({
                triangles: 39_936,
                cap: TRIANGLE_CAP,
                preselected: true,
                applied: true,
            });
            expect(simplify.simplifiedTriangles).toBeLessThanOrEqual(
                TRIANGLE_CAP,
            );
            expect(model.sidecar.triangles).toBe(simplify.simplifiedTriangles);
            expect(model.sidecar.distantTriangles).toBeLessThanOrEqual(2_000);
            const { max } = await checkStored(model.parts.model);
            expect(max[1]).toBeCloseTo(0.686, 2);
            expect(model.sidecar.sizeM.width).toBeCloseTo(0.827, 2);
            expect(model.sidecar.sizeM.height).toBeCloseTo(0.686, 2);
            expect(model.sidecar.sizeM.depth).toBeCloseTo(0.57, 2);
        });

        it("keeps every triangle when the user says no, with a note", async () => {
            const result = await run([picked("SheenChair.glb")], {
                simplify: false,
            });
            const model = imported(result);
            expect(model.sidecar.triangles).toBe(39_936);
            expect(result.report.notes).toContainEqual({
                code: "overTriangleCap",
                triangles: 39_936,
                cap: TRIANGLE_CAP,
            });
        });

        it("drops the extensions GLTFLoader can't use and says so", async () => {
            const result = await run([picked("SheenChair.glb")]);
            expect(result.report.fixedForYou).toContainEqual({
                code: "extensionsDropped",
                extensions: ["KHR_materials_sheen", "KHR_materials_variants"],
            });
        });

        it("draws the chair from above for the field, with a stand point on its seat", async () => {
            const model = imported(await run([picked("SheenChair.glb")]));
            const ring = model.sidecar.plan.outline[0];
            const xs = ring.filter((_, i) => i % 2 === 0);
            expect(Math.min(...xs)).toBeLessThan(-380);
            expect(Math.max(...xs)).toBeGreaterThan(380);
            expect(model.sidecar.plan.details.length).toBeGreaterThan(0);
            expect(model.sidecar.stand?.topM).toBeGreaterThan(0.3);
            expect(model.sidecar.stand?.topM).toBeLessThan(0.6);
        });
    });

    it("offers cm for a file in centimeters, pre-selected", async () => {
        const glb = await chairWith((doc) =>
            wrapRoots(doc, { scale: [100, 100, 100] }),
        );
        const result = await run([picked("chair-cm.glb", glb)]);
        const unit = choiceOf(result, "unitFix")!;
        expect(unit).toMatchObject({
            options: ["none", "cm", "in"],
            preselected: "cm",
            applied: "cm",
        });
        expect(imported(result).sidecar.sizeM.width).toBeCloseTo(0.827, 2);

        const declined = await run([picked("chair-cm.glb", glb)], {
            unitFix: "none",
        });
        expect(declined.report.notes).toContainEqual(
            expect.objectContaining({ code: "sizeOutOfRange" }),
        );
    });

    it("turns a Z-up model upright, pre-selected", async () => {
        const glb = await postGlb(
            [0.3, 1.8, 0.3],
            [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
        );
        const result = await run([picked("post-z-up.glb", glb)]);
        expect(choiceOf(result, "tilt")).toEqual({
            code: "tilt",
            preselected: Z_UP_TILT,
            applied: Z_UP_TILT,
            zUpSuspected: true,
        });
        const model = imported(result);
        expect(model.sidecar.sizeM.height).toBeCloseTo(1.8, 3);
        await checkStored(model.parts.model);
    });

    it("leaves an upright model alone", async () => {
        const result = await run([
            picked("post.glb", await postGlb([0.3, 1.8, 0.3])),
        ]);
        expect(choiceOf(result, "tilt")).toEqual({
            code: "tilt",
            preselected: UPRIGHT,
            applied: UPRIGHT,
            zUpSuspected: false,
        });
        expect(imported(result).sidecar.sizeM.height).toBeCloseTo(1.8, 3);
    });

    it("stands up a long model lying on its side when tipped", async () => {
        // A car 4 m long, 1.4 m tall and 1.8 m wide, lying on its side facing right: nothing
        // to suspect, so it stays as it is until tipped
        const glb = await postGlb([4, 1.8, 1.4]);
        const result = await run([picked("car-on-side.glb", glb)]);
        expect(choiceOf(result, "tilt")).toMatchObject({ zUpSuspected: false });
        expect(imported(result).sidecar.sizeM.height).toBeCloseTo(1.8, 3);

        const tilt = tipped(UPRIGHT, 0, "x");
        const model = imported(
            await run([picked("car-on-side.glb", glb)], { tilt }),
        );
        expect(model.sidecar.sizeM.width).toBeCloseTo(4, 3);
        expect(model.sidecar.sizeM.height).toBeCloseTo(1.4, 3);
        expect(model.sidecar.sizeM.depth).toBeCloseTo(1.8, 3);
        await checkStored(model.parts.model);
    });

    it("tips after turning the way the picture shows", async () => {
        // Turned a quarter, the 4 m side runs toward the audience; tipping forward then stands
        // it up (tipping about the file's own axis would stand the 1.8 m side up instead)
        const glb = await postGlb([4, 1.4, 1.8]);
        const turn = 90;
        const tilt = tipped(UPRIGHT, turn, "x");
        const model = imported(
            await run([picked("car.glb", glb)], { turn, tilt }),
        );
        expect(model.sidecar.sizeM.width).toBeCloseTo(1.8, 3);
        expect(model.sidecar.sizeM.height).toBeCloseTo(4, 3);
        expect(model.sidecar.sizeM.depth).toBeCloseTo(1.4, 3);
    });

    it("ignores a tilt that isn't a quarter-turn rotation", async () => {
        const glb = await postGlb([0.3, 1.8, 0.3]);
        const result = await run([picked("post.glb", glb)], {
            tilt: [1, 0, 0, 0, 1, 0, 0, 0, -1],
        });
        expect(choiceOf(result, "tilt")?.applied).toEqual(UPRIGHT);
    });

    it("turns the front toward the audience when asked", async () => {
        const glb = await postGlb([2, 1, 0.5]);
        const model = imported(
            await run([picked("bench.glb", glb)], { turn: 90 }),
        );
        expect(model.sidecar.facing.turnDeg).toBe(90);
        expect(model.sidecar.sizeM.width).toBeCloseTo(0.5, 3);
        expect(model.sidecar.sizeM.depth).toBeCloseTo(2, 3);
    });

    it("moves an off-center pivot to the bottom center", async () => {
        const glb = await chairWith((doc) =>
            wrapRoots(doc, { translation: [5, 2, -3] }),
        );
        const result = await run([picked("chair-off-center.glb", glb)]);
        const fix = result.report.fixedForYou.find(
            (f) => f.code === "pivotMoved",
        );
        expect(fix).toBeDefined();
        await checkStored(imported(result).parts.model);
    });

    it("refuses more than 4× the triangle cap before decoding", async () => {
        // Three chairs sharing one mesh: 119,808 triangles drawn
        const glb = await chairWith((doc) => {
            const scene = doc.getRoot().listScenes()[0];
            const parts = doc
                .getRoot()
                .listNodes()
                .filter((n) => n.getMesh());
            for (const dx of [1, 2]) {
                const copy = doc
                    .createNode(`copy ${dx}`)
                    .setTranslation([dx, 0, 0]);
                for (const node of parts)
                    copy.addChild(
                        doc
                            .createNode()
                            .setMesh(node.getMesh())
                            .setMatrix(node.getWorldMatrix()),
                    );
                scene.addChild(copy);
            }
        });
        expect(refusal(await run([picked("three-chairs.glb", glb)]))).toEqual({
            code: "tooManyTriangles",
            triangles: 119_808,
            cap: TRIANGLE_CAP,
            limit: 80_000,
        });
    });

    it("refuses more than 4× the cap once decoded, whatever the JSON declares", async () => {
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
        expect(
            refusal(await run([picked("draco-chairs.glb", understated)])),
        ).toEqual({
            code: "tooManyTriangles",
            triangles: 119_808,
            cap: TRIANGLE_CAP,
            limit: 80_000,
        });
    });

    it("refuses meshopt data that would decode past its budget", async () => {
        const glb = editGlbJson(read("TextureCoordinateTest.glb"), (json) => {
            (json.bufferViews as Record<string, unknown>[])[0].extensions = {
                EXT_meshopt_compression: {
                    buffer: 0,
                    byteLength: 4,
                    byteStride: 4,
                    count: 100_000_000,
                    mode: "ATTRIBUTES",
                },
            };
        });
        expect(refusal(await run([picked("meshopt.glb", glb)]))).toMatchObject({
            code: "tooLarge",
            bytes: 400_000_000,
        });
    });

    describe("textures", () => {
        const withTexture = (image: Uint8Array) =>
            chairWith((doc) => {
                doc.getRoot()
                    .listTextures()[0]
                    .setImage(image)
                    .setMimeType("image/png");
            });

        it("shrinks one past the cap to 1024", async () => {
            const glb = await withTexture(
                await solidPng(2048, 2048, [200, 50, 50, 255]),
            );
            const result = await run([picked("chair-2k.glb", glb)]);
            const fix = result.report.fixedForYou.find(
                (f) => f.code === "texturesShrunk",
            );
            expect(fix).toMatchObject({
                cap: 1024,
                textures: [{ from: [2048, 2048], to: [1024, 1024] }],
            });
            const doc = await readGlb(imported(result).parts.model);
            for (const texture of doc.getRoot().listTextures())
                expect(Math.max(...texture.getSize()!)).toBeLessThanOrEqual(
                    1024,
                );
        });

        it("refuses one past 8192 px from its header, before decoding", async () => {
            const glb = await withTexture(pngHeaderOnly(16384, 16384));
            expect(
                refusal(await run([picked("chair-16k.glb", glb)])),
            ).toMatchObject({
                code: "imageTooLarge",
                width: 16384,
                height: 16384,
                limit: 8192,
            });
        });

        it("accepts 8192 px exactly", async () => {
            const glb = await withTexture(pngHeaderOnly(8192, 8192));
            const result = await run([picked("chair-8k.glb", glb)]);
            // The stand-in codec never decodes; the header passed the check
            expect(result.report.cantImport.map((r) => r.code)).not.toContain(
                "imageTooLarge",
            );
        });

        it("keeps a PNG with alpha as PNG, blending", async () => {
            const glb = await withTexture(
                await solidPng(64, 64, [255, 255, 255, 128]),
            );
            const blended = await chairWith(async (doc) => {
                const material = doc.getRoot().listMaterials()[0];
                material.setAlphaMode("BLEND");
                material
                    .getBaseColorTexture()!
                    .setImage(await solidPng(64, 64, [255, 255, 255, 128]))
                    .setMimeType("image/png");
            });
            for (const bytes of [glb, blended]) {
                const doc = await readGlb(
                    imported(await run([picked("a.glb", bytes)])).parts.model,
                );
                expect(
                    doc
                        .getRoot()
                        .listTextures()
                        .map((t) => t.getMimeType()),
                ).toContain("image/png");
            }
            const doc = await readGlb(
                imported(await run([picked("blend.glb", blended)])).parts.model,
            );
            expect(
                doc
                    .getRoot()
                    .listMaterials()
                    .map((m) => m.getAlphaMode()),
            ).toContain("BLEND");
        });

        it("refuses a model that requires KTX2 textures", async () => {
            const glb = editGlbJson(
                read("TextureCoordinateTest.glb"),
                (json) => {
                    json.extensionsUsed = ["KHR_texture_basisu"];
                    json.extensionsRequired = ["KHR_texture_basisu"];
                    (json.images as object[]).push({
                        uri: `data:image/ktx2;base64,${Buffer.from(ktx2Header(512, 512)).toString("base64")}`,
                    });
                },
            );
            expect(refusal(await run([picked("ktx2.glb", glb)]))).toEqual({
                code: "requiredExtension",
                extensions: ["KHR_texture_basisu"],
            });
        });
    });

    describe("files the model names", () => {
        it("imports a .gltf with its .bin and textures picked beside it", async () => {
            const files = await separateGltf();
            expect(files.map((f) => f.name).sort()).toEqual([
                "TextureCoordinateTest.bin",
                "TextureCoordinateTest.gltf",
                "texture0.png",
            ]);
            const model = imported(await run(files));
            await checkStored(model.parts.model);
            expect(model.name).toBe("TextureCoordinateTest");
        });

        it("reports a file the .gltf names that wasn't picked", async () => {
            const files = await separateGltf();
            const withoutTexture = files.filter(
                (f) => !f.name.endsWith(".png"),
            );
            expect(refusal(await run(withoutTexture))).toEqual({
                code: "missingFile",
                uri: "textures/texture0.png",
            });
        });

        it.each([
            ["https://example.com/wood.png", "externalUri"],
            ["file:///etc/passwd", "externalUri"],
            ["../wood.png", "outsidePickedFiles"],
            ["/home/someone/wood.png", "outsidePickedFiles"],
            ["C:/models/wood.png", "outsidePickedFiles"],
            ["%2E%2E/wood.png", "outsidePickedFiles"],
        ])("refuses an image at %s", async (uri, code) => {
            const glb = editGlbJson(
                read("TextureCoordinateTest.glb"),
                (json) => {
                    (
                        json.images as { uri?: string; bufferView?: number }[]
                    )[0] = { uri };
                },
            );
            expect(refusal(await run([picked("outside.glb", glb)]))).toEqual({
                code,
                uri,
            });
        });
    });

    it("decodes a Draco-compressed model and stores it plain (Box)", async () => {
        const result = await run([picked("Box.gltf"), picked("Box.bin")]);
        const model = imported(result);
        expect(result.report.fixedForYou).toContainEqual({
            code: "dracoDecoded",
        });
        expect(model.sidecar.triangles).toBe(12);
        await checkStored(model.parts.model);
        expect(model.sidecar.sizeM).toEqual({ width: 1, height: 1, depth: 1 });
    });

    describe("invalid files", () => {
        it("refuses validator errors with the first messages", async () => {
            const glb = editGlbJson(
                read("TextureCoordinateTest.glb"),
                (json) => {
                    // Off by one: the accessor reads past the end of its buffer view
                    const accessor = (json.accessors as { count: number }[])[0];
                    accessor.count += 1;
                },
            );
            const refused = refusal(await run([picked("invalid.glb", glb)]));
            expect(refused.code).toBe("validatorErrors");
        });

        it("refuses a file that isn't glTF", async () => {
            const bytes = new TextEncoder().encode(
                "solid cube\nendsolid cube\n",
            );
            expect(refusal(await run([picked("cube.gltf", bytes)]))).toEqual({
                code: "unreadable",
                reason: "not a GLB or glTF JSON file",
            });
        });

        it("refuses picks with no model, or with two", async () => {
            expect(
                refusal(
                    await run([picked("cube.fbx", new Uint8Array([1, 2, 3]))]),
                ),
            ).toEqual({ code: "noModelFile", names: ["cube.fbx"] });
            expect(
                refusal(
                    await run([
                        picked("TextureCoordinateTest.glb"),
                        picked("SheenChair.glb"),
                    ]),
                ),
            ).toEqual({
                code: "severalModelFiles",
                names: ["TextureCoordinateTest.glb", "SheenChair.glb"],
            });
        });

        it("refuses a rigged model", async () => {
            const glb = await chairWith((doc) => {
                const node = doc
                    .getRoot()
                    .listNodes()
                    .find((n) => n.getMesh())!;
                const joint = doc.createNode("joint");
                doc.getRoot().listScenes()[0].addChild(joint);
                const skin = doc.createSkin("rig").addJoint(joint);
                node.setSkin(skin);
                const mesh = node.getMesh()!;
                const buffer = doc.getRoot().listBuffers()[0];
                for (const prim of mesh.listPrimitives()) {
                    const n = prim.getAttribute("POSITION")!.getCount();
                    prim.setAttribute(
                        "JOINTS_0",
                        doc
                            .createAccessor()
                            .setType("VEC4")
                            .setArray(new Uint8Array(n * 4))
                            .setBuffer(buffer),
                    );
                    prim.setAttribute(
                        "WEIGHTS_0",
                        doc
                            .createAccessor()
                            .setType("VEC4")
                            .setArray(
                                Float32Array.from({ length: n * 4 }, (_, i) =>
                                    i % 4 === 0 ? 1 : 0,
                                ),
                            )
                            .setBuffer(buffer),
                    );
                }
            });
            expect(refusal(await run([picked("rigged.glb", glb)]))).toEqual({
                code: "rigged",
            });
        });
    });
});
