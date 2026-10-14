// @vitest-environment node
// cspell:words basisu clearcoat meshopt
/**
 * The model import pipeline against the committed fixtures
 * (`fixtures/generate.ts` makes them). Each report row and each rejection has
 * a fixture here, and every ready output loads in bare `GLTFLoader`.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import type { SkinnedMesh } from "three";
import { describe, expect, it } from "vitest";
import { parseContainer, readModelFile } from "../container";
import { importModel, importModelFile } from "../pipeline";
import { OUTPUT_EXTENSIONS, TRIANGLE_CAPS } from "../rules";
import {
    ModelSidecarSchema,
    type ChoiceRow,
    type ModelFileInput,
    type FixRow,
    type ModelImportOptions,
    type ModelImportResult,
    type ModelImportStage,
    type NoteRow,
    type Rejection,
} from "../types";
import { V4_INVERSE_BIND_MATRICES, V4_JOINT_NAMES } from "../v4-skeleton";
import { loadWithBareGltfLoader } from "./gltfLoader";

const FIXTURES = path.join(__dirname, "fixtures");
const fixture = (name: string) => path.join(FIXTURES, name);

const run = (name: string, options?: ModelImportOptions) =>
    importModelFile(fixture(name), options);

const rejection = <C extends Rejection["code"]>(
    r: ModelImportResult,
    code: C,
) =>
    r.report.cantImport.find((x) => x.code === code) as
        | Extract<Rejection, { code: C }>
        | undefined;
const choice = <C extends ChoiceRow["code"]>(r: ModelImportResult, code: C) =>
    r.report.needsChoice.find((x) => x.code === code) as
        | Extract<ChoiceRow, { code: C }>
        | undefined;
const fix = <C extends FixRow["code"]>(r: ModelImportResult, code: C) =>
    r.report.fixedForYou.find((x) => x.code === code) as
        | Extract<FixRow, { code: C }>
        | undefined;
const note = <C extends NoteRow["code"]>(r: ModelImportResult, code: C) =>
    r.report.notes.find((x) => x.code === code) as
        | Extract<NoteRow, { code: C }>
        | undefined;

function expectRejected(r: ModelImportResult) {
    expect(r.report.status).toBe("rejected");
    expect(r.output).toBeNull();
}

/** A fixture GLB with its JSON chunk edited (for deliberately bad files). */
async function editedGlb(
    name: string,
    edit: (json: Record<string, any>) => void,
): Promise<Uint8Array> {
    const glb = new Uint8Array(await readFile(fixture(name)));
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(
        new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)),
    );
    edit(json);
    let text = JSON.stringify(json);
    while (new TextEncoder().encode(text).length % 4) text += " ";
    const jsonBytes = new TextEncoder().encode(text);
    const rest = glb.subarray(20 + jsonLength);
    const out = new Uint8Array(20 + jsonBytes.length + rest.length);
    const outView = new DataView(out.buffer);
    outView.setUint32(0, 0x46546c67, true);
    outView.setUint32(4, 2, true);
    outView.setUint32(8, out.length, true);
    outView.setUint32(12, jsonBytes.length, true);
    outView.setUint32(16, 0x4e4f534a, true);
    out.set(jsonBytes, 20);
    out.set(rest, 20 + jsonBytes.length);
    return out;
}

/** The normalized GLB's raw JSON. */
function outputJson(r: ModelImportResult) {
    return parseContainer(r.output!.glb).json as Record<string, any>;
}

/** Checks a ready output: plain GLB, valid sidecar, loads with no decoders. */
async function expectLoadsBare(r: ModelImportResult) {
    expect(r.report.status).toBe("ready");
    const json = outputJson(r);
    for (const ext of json.extensionsUsed ?? []) {
        expect(OUTPUT_EXTENSIONS.has(ext)).toBe(true);
    }
    for (const ext of json.extensionsRequired ?? []) {
        expect(OUTPUT_EXTENSIONS.has(ext)).toBe(true);
    }
    // No custom properties survive in the GLB: the sidecar holds them.
    expect(JSON.stringify(json)).not.toContain('"extras"');
    ModelSidecarSchema.parse(
        JSON.parse(new TextDecoder().decode(r.output!.sidecarBytes)),
    );
    const { gltf, warnings, errors } = await loadWithBareGltfLoader(
        r.output!.glb,
    );
    expect(warnings.filter((w) => /extension/i.test(w))).toEqual([]);
    expect(errors).toEqual([]);
    let meshes = 0;
    gltf.scene.traverse((o) => {
        if ((o as { isMesh?: boolean }).isMesh) meshes++;
    });
    expect(meshes).toBeGreaterThan(0);
    return gltf;
}

describe("clean files", () => {
    it("imports a clean Starter kit flag in one click", async () => {
        const r = await run("equipment-clean-kit.glb");
        expect(r.report.kind).toBe("equipment");
        expect(r.report.kindSource).toBe("stamp");
        expect(r.report.cantImport).toEqual([]);
        expect(r.report.needsChoice).toEqual([]);
        expect(r.report.fixedForYou).toEqual([]);
        expect(r.report.notes).toEqual([]);
        expect(r.report.badges).toEqual([]);

        const sidecar = r.output!.sidecar;
        expect(sidecar.kind).toBe("equipment");
        expect(sidecar.stamp).toEqual({
            itemId: "6b1f3c1e-5a43-4d0e-9a51-2f7c8e9d0a11",
            kind: "equipment",
            kitVersion: "1.0.0",
        });
        expect(sidecar.grips.right!.position[1]).toBeCloseTo(0.3, 6);
        expect(sidecar.grips.left!.position[1]).toBeCloseTo(0.9, 6);
        // +Z of the grip frame runs up the pole (+Y).
        const [x, , , w] = sidecar.grips.right!.rotation;
        expect(x).toBeCloseTo(-Math.SQRT1_2, 6);
        expect(w).toBeCloseTo(Math.SQRT1_2, 6);
        expect(sidecar.stretch).toEqual({ x: null, y: [0.4, 1], z: null });
        expect(sidecar.bounds.size[1]).toBeCloseTo(1.8288, 4);
        expect(sidecar.artworkSlots).toHaveLength(1);
        const slot = sidecar.artworkSlots[0];
        expect(slot).toMatchObject({
            id: "silk",
            widthM: 0.9144,
            heightM: 1.3716,
            hasUVs: true,
        });

        const gltf = await expectLoadsBare(r);
        // The slot's index points at the silk material in the GLB.
        const material = await gltf.parser.getDependency(
            "material",
            (slot.target as { material: number }).material,
        );
        expect(material.name).toBe("Silk");
    });

    it("gives identical bytes for an identical import", async () => {
        const a = await run("equipment-clean-kit.glb");
        const b = await run("equipment-clean-kit.glb");
        expect(
            Buffer.from(a.output!.glb).equals(Buffer.from(b.output!.glb)),
        ).toBe(true);
        expect(
            Buffer.from(a.output!.sidecarBytes).equals(
                Buffer.from(b.output!.sidecarBytes),
            ),
        ).toBe(true);
    });

    it("gives the same parts for the same file under another name", async () => {
        const bytes = new Uint8Array(
            await readFile(fixture("equipment-clean-kit.glb")),
        );
        const a = await importModel({ filename: "flag.glb", bytes });
        const b = await importModel({ filename: "flag (1).glb", bytes });
        expect(
            Buffer.from(a.output!.sidecarBytes).equals(
                Buffer.from(b.output!.sidecarBytes),
            ),
        ).toBe(true);
    });

    it("imports a .gltf with an external .bin and .png", async () => {
        const r = await run("model.gltf");
        expect(r.report.kind).toBe("prop");
        expect(r.report.cantImport).toEqual([]);
        expect(r.report.needsChoice).toEqual([]);
        expect(r.report.output!.textures).toHaveLength(1);
        const gltf = await expectLoadsBare(r);
        expect(gltf.parser.json.textures).toHaveLength(1);
        const texture = await gltf.parser.getDependency("texture", 0);
        expect(texture.image).toMatchObject({ width: 1, height: 1 });
    });

    it("saves the Import notes in the sidecar", async () => {
        const r = await run("equipment-dense.glb");
        expect(r.output!.sidecar.importNotes).toEqual({
            needsChoice: r.report.needsChoice,
            fixedForYou: r.report.fixedForYou,
            notes: r.report.notes,
            badges: r.report.badges,
        });
    });
});

describe("Can't import", () => {
    it("rejects bytes that are neither GLB nor glTF", async () => {
        const r = await importModel({
            filename: "notes.glb",
            bytes: new TextEncoder().encode("hello"),
        });
        expectRejected(r);
        expect(rejection(r, "unreadable")).toBeDefined();
    });

    it("rejects a .gltf whose resources are missing", async () => {
        const bytes = new Uint8Array(await readFile(fixture("model.gltf")));
        const r = await importModel({ filename: "model.gltf", bytes });
        expectRejected(r);
        expect(rejection(r, "missingResource")?.uri).toBe("model.bin");
    });

    it("refuses URIs that leave the picked folder by scheme", async () => {
        const json = JSON.parse(await readFile(fixture("model.gltf"), "utf8"));
        json.buffers[0].uri = "https://example.com/model.bin";
        const r = await importModel({
            filename: "model.gltf",
            bytes: new TextEncoder().encode(JSON.stringify(json)),
        });
        expectRejected(r);
        expect(rejection(r, "externalUri")?.uri).toBe(
            "https://example.com/model.bin",
        );
    });

    it("refuses a GLB's URIs without reading them", async () => {
        const cases = [
            ["../secret.png", "resourceOutsideFolder"],
            ["file:///etc/hosts", "externalUri"],
            ["%E0%A4%A.png", "resourceOutsideFolder"],
            ["logo.png", "missingResource"],
        ] as const;
        for (const [uri, code] of cases) {
            const bytes = await editedGlb("prop-no-extras.glb", (json) => {
                json.images = [{ uri }];
                json.textures = [{ source: 0 }];
            });
            const r = await importModel(
                { filename: "prop.glb", bytes },
                { kind: "prop" },
            );
            expectRejected(r);
            expect(r.report.cantImport).toEqual([{ code, uri }]);
        }
    });

    it("blocks on validator errors", async () => {
        const r = await run("invalid.glb");
        expectRejected(r);
        const row = rejection(r, "validatorErrors")!;
        expect(row.count).toBeGreaterThan(0);
        expect(row.messages[0].code).toBe("ACCESSOR_TOO_LONG");
    });

    it("rejects a required extension outside the allow-list, by name", async () => {
        const r = await run("prop-required-extension.glb");
        expectRejected(r);
        expect(rejection(r, "requiredExtension")?.extensions).toEqual([
            "KHR_texture_basisu",
        ]);
    });

    it("rejects over 4× the triangle cap", async () => {
        const r = await run("equipment-over-4x.glb");
        expectRejected(r);
        expect(rejection(r, "overTriangleCap")).toMatchObject({
            cap: TRIANGLE_CAPS.equipment,
            limit: 4 * TRIANGLE_CAPS.equipment,
        });
    });

    it("rejects a rig on anything but a Garment", async () => {
        const r = await run("prop-rigged.glb");
        expectRejected(r);
        expect(rejection(r, "rigNotAllowed")?.kind).toBe("prop");
    });

    it("rejects a Garment with no rig", async () => {
        const r = await run("garment-not-rigged.glb");
        expectRejected(r);
        expect(rejection(r, "garmentNotRigged")).toBeDefined();
    });

    it("rejects a Garment on any rig but the exact v4 joints", async () => {
        const r = await run("garment-wrong-joints.glb");
        expectRejected(r);
        const row = rejection(r, "garmentJointsNotV4")!;
        expect(row.unexpected).toEqual(["Bone.003"]);
        expect(row.missing).toContain("DEF-hand.R");
    });

    it("rejects a Garment off the v4 rest pose", async () => {
        const r = await run("garment-rest-pose.glb");
        expectRejected(r);
        const row = rejection(r, "garmentRestPoseMismatch")!;
        expect(row.joints.map((j) => j.name)).toEqual(["DEF-spine"]);
        expect(row.joints[0].translationM).toBeCloseTo(0.05, 4);
    });

    it("rejects a Garment with quantized positions", async () => {
        const r = await run("garment-quantized.glb");
        expectRejected(r);
        expect(rejection(r, "garmentQuantized")?.meshes).toEqual(["Jacket0"]);
    });

    it("rejects a Garment with transforms not applied", async () => {
        const r = await run("garment-transforms.glb");
        expectRejected(r);
        expect(rejection(r, "garmentTransformsNotApplied")?.nodes).toEqual([
            "Jacket0",
        ]);
    });

    it("rejects a Garment without _PART paint", async () => {
        const r = await run("garment-no-part.glb");
        expectRejected(r);
        expect(rejection(r, "garmentNoPartPaint")?.meshes).toEqual(["Jacket0"]);
    });

    it("rejects a Garment with no median fit", async () => {
        const r = await run("garment-no-median.glb");
        expectRejected(r);
        expect(rejection(r, "garmentNoMedianFit")?.fits).toEqual([
            "neutral-slim",
        ]);
    });

    it("rejects a Garment whose fit names no body type", async () => {
        const r = await run("garment-unknown-fit.glb");
        expectRejected(r);
        expect(rejection(r, "garmentUnknownFit")?.meshes).toEqual([
            { node: "Jacket1", fit: "neutral-wide" },
        ]);
        expect(rejection(r, "garmentNoMedianFit")).toBeUndefined();
    });

    it("rejects a file with no triangles", async () => {
        const json = JSON.parse(await readFile(fixture("model.gltf"), "utf8"));
        delete json.meshes;
        delete json.accessors;
        delete json.bufferViews;
        delete json.buffers;
        delete json.materials;
        delete json.textures;
        delete json.images;
        delete json.samplers;
        json.nodes = [{ name: "Empty" }];
        const r = await importModel(
            {
                filename: "empty.gltf",
                bytes: new TextEncoder().encode(JSON.stringify(json)),
            },
            { kind: "prop" },
        );
        expectRejected(r);
        expect(rejection(r, "noGeometry")).toBeDefined();
    });
});

describe("Needs your choice", () => {
    it("asks for the kind when nothing sets it, pre-selecting nothing", async () => {
        const r = await run("prop-no-extras.glb");
        expect(r.report.status).toBe("needs-kind");
        expect(r.output).toBeNull();
        expect(choice(r, "kind")).toMatchObject({ preselected: null });
    });

    it("takes the kind from a picker, with no kind row", async () => {
        const r = await run("prop-no-extras.glb", { kind: "prop" });
        expect(r.report.kindSource).toBe("option");
        expect(choice(r, "kind")).toBeUndefined();
        // No extras at all: hint at the export preset; no stretch zones.
        expect(note(r, "customPropertiesOff")).toBeDefined();
        expect(note(r, "noStretchZones")).toBeDefined();
        expect(r.report.badges).toContain("noStretchZones");
        await expectLoadsBare(r);
    });

    it("pre-selects the unit conversion that lands in range", async () => {
        const r = await run("equipment-centimeters.glb");
        const row = choice(r, "unitConversion")!;
        expect(row.options).toEqual(["none", "cm"]);
        expect(row.preselected).toBe("cm");
        expect(row.applied).toBe("cm");
        expect(r.report.badges).toContain("scaled");
        expect(r.output!.sidecar.bounds.size[1]).toBeCloseTo(1.8288, 4);
        expect(r.output!.sidecar.grips.right!.position[1]).toBeCloseTo(0.3, 6);
        expect(r.output!.sidecar.stretch!.y![1]).toBeCloseTo(1, 6);
        await expectLoadsBare(r);
    });

    it("keeps the file's units when the user says so", async () => {
        const r = await run("equipment-centimeters.glb", {
            choices: { unitConversion: "none" },
        });
        expect(choice(r, "unitConversion")!.applied).toBe("none");
        expect(r.output!.sidecar.bounds.size[1]).toBeCloseTo(182.88, 2);
        expect(note(r, "sizeOutOfRange")).toBeDefined();
        expect(r.report.badges).not.toContain("scaled");
    });

    it("flags a size no conversion fixes", async () => {
        const r = await run("equipment-implausible.glb");
        expect(choice(r, "unitConversion")).toBeUndefined();
        expect(note(r, "sizeOutOfRange")).toMatchObject({ minM: 0.3, maxM: 3 });
    });

    it("pre-selects rotate to Y-up for Z-up Equipment", async () => {
        const r = await run("equipment-z-up.glb");
        expect(choice(r, "rotateToYUp")).toMatchObject({
            preselected: true,
            applied: true,
        });
        const sidecar = r.output!.sidecar;
        expect(sidecar.bounds.size[1]).toBeCloseTo(1.8288, 4);
        // The zones and grips turn with the model.
        expect(sidecar.stretch).toEqual({ x: null, y: [0.4, 1], z: null });
        expect(sidecar.grips.right!.position[1]).toBeCloseTo(0.3, 6);
        await expectLoadsBare(r);
    });

    it("offers rotate to Y-up for a floor without checking it", async () => {
        const r = await run("floor-z-up.glb");
        expect(choice(r, "rotateToYUp")).toMatchObject({
            preselected: false,
            applied: false,
        });
        const rotated = await run("floor-z-up.glb", {
            choices: { rotateToYUp: true },
        });
        expect(rotated.output!.sidecar.bounds.size[1]).toBeCloseTo(0.01, 4);
        // 25 × 34 m is wider than WGI's 78 ft.
        expect(note(rotated, "wgi")?.wgi).toBe("floorOverMaximum");
    });

    it("flags triangles over the cap with simplify pre-selected", async () => {
        const r = await run("equipment-dense.glb");
        const row = choice(r, "simplify")!;
        expect(row.triangles).toBeGreaterThan(TRIANGLE_CAPS.equipment);
        expect(row.preselected).toBe(true);
        expect(row.simplifiedTriangles).toBeLessThanOrEqual(
            TRIANGLE_CAPS.equipment,
        );
        expect(r.report.output!.triangles).toBe(row.simplifiedTriangles);
        expect(r.report.badges).toContain("simplified");
        await expectLoadsBare(r);

        const kept = await run("equipment-dense.glb", {
            choices: { simplify: false },
        });
        expect(choice(kept, "simplify")!.simplifiedTriangles).toBeNull();
        expect(kept.report.output!.triangles).toBe(row.triangles);
    });

    it("pre-selects a grip when Equipment has no OM_grip_R", async () => {
        const r = await run("equipment-no-grip.glb");
        const row = choice(r, "missingGrip")!;
        expect(row.applied).toEqual(row.preselected);
        expect(r.output!.sidecar.grips.right!.position).toEqual(
            row.preselected.right,
        );

        const picked = await run("equipment-no-grip.glb", {
            choices: { grip: { right: [0, 0.25, 0], left: [0, 0.8, 0] } },
        });
        expect(picked.output!.sidecar.grips.right!.position).toEqual([
            0, 0.25, 0,
        ]);
        expect(picked.output!.sidecar.grips.left!.position).toEqual([
            0, 0.8, 0,
        ]);

        const none = await run("equipment-no-grip.glb", {
            choices: { grip: null },
        });
        expect(none.output!.sidecar.grips.right).toBeNull();
    });

    it("takes artwork slots set by hand", async () => {
        const r = await run("prop-no-extras.glb", {
            kind: "prop",
            choices: {
                slots: [
                    { material: 0, id: "front", widthM: 2.4, heightM: 0.6 },
                ],
            },
        });
        expect(r.output!.sidecar.artworkSlots).toEqual([
            {
                id: "front",
                widthM: 2.4,
                heightM: 0.6,
                target: { material: 0 },
                hasUVs: true,
            },
        ]);
        expect(note(r, "customPropertiesOff")).toBeUndefined();
    });
});

describe("materials (Q67)", () => {
    it("lists each source material with its size and file slot", async () => {
        const r = await run("equipment-clean-kit.glb");
        expect(r.report.materials.map((m) => [m.name, m.fileSlot])).toEqual([
            ["PoleMetal", null],
            ["Silk", "silk"],
        ]);
        const silk = r.report.materials[1];
        expect(silk.index).toBe(1);
        expect(silk.hasUVs).toBe(true);
        expect(silk.sizeM![0]).toBeCloseTo(0.9144, 4);
        expect(silk.sizeM![1]).toBeCloseTo(1.3716, 4);
        // Both faces of the thin box, plus its edges.
        expect(silk.areaM2).toBeGreaterThan(2 * 0.9144 * 1.3716);
        expect(silk.areaM2).toBeLessThan(2 * 0.9144 * 1.3716 + 0.01);
        // `outputIndex` finds the same material in the normalized GLB.
        const gltf = await expectLoadsBare(r);
        const material = await gltf.parser.getDependency(
            "material",
            silk.outputIndex!,
        );
        expect(material.name).toBe("Silk");
    });

    it("measures materials in output meters once converted", async () => {
        const r = await run("equipment-centimeters.glb");
        expect(choice(r, "unitConversion")?.applied).toBe("cm");
        const silk = r.report.materials.find((m) => m.name === "Silk")!;
        expect(silk.sizeM![0]).toBeCloseTo(0.9144, 4);
        expect(silk.sizeM![1]).toBeCloseTo(1.3716, 4);
    });

    it("lists materials before the kind is known, with no output index", async () => {
        const r = await run("prop-no-extras.glb");
        expect(r.report.status).toBe("needs-kind");
        expect(r.report.materials).toEqual([
            {
                index: 0,
                name: "Wood",
                outputIndex: null,
                sizeM: [
                    expect.closeTo(2.4, 6),
                    expect.closeTo(0.6, 6),
                    expect.closeTo(1.2, 6),
                ],
                areaM2: expect.closeTo(10.08, 4),
                hasUVs: true,
                fileSlot: null,
            },
        ]);
    });

    it("writes a slot picked from the list on that material", async () => {
        const listed = await run("prop-no-extras.glb", { kind: "prop" });
        const wood = listed.report.materials[0];
        expect(wood.outputIndex).toBe(0);
        const r = await run("prop-no-extras.glb", {
            kind: "prop",
            choices: {
                slots: [
                    {
                        material: wood.index,
                        id: "artwork",
                        widthM: 2.4,
                        heightM: 0.6,
                    },
                ],
            },
        });
        expect(r.output!.sidecar.artworkSlots).toEqual([
            {
                id: "artwork",
                widthM: 2.4,
                heightM: 0.6,
                target: { material: wood.outputIndex },
                hasUVs: true,
            },
        ]);
    });

    it("lists none for a file it can't read", async () => {
        const r = await run("invalid.glb");
        expectRejected(r);
        expect(r.report.materials).toEqual([]);
    });
});

describe("Fixed for you", () => {
    it("downsizes textures to the kind's cap", async () => {
        const r = await run("prop-big-texture.glb");
        expect(fix(r, "texturesDownsized")).toEqual({
            code: "texturesDownsized",
            cap: 1024,
            textures: [{ name: "Banner", from: [2048, 64], to: [1024, 32] }],
        });
        expect(r.report.output!.textures[0]).toMatchObject({
            width: 1024,
            height: 32,
            mimeType: "image/png",
        });
        await expectLoadsBare(r);
    });

    it("decodes Draco", async () => {
        const r = await run("prop-draco.glb");
        expect(fix(r, "dracoDecoded")).toBeDefined();
        expect(outputJson(r).extensionsUsed ?? []).not.toContain(
            "KHR_draco_mesh_compression",
        );
        await expectLoadsBare(r);
    });

    it("starts from files bare GLTFLoader can't load", async () => {
        for (const name of ["prop-draco.glb", "prop-meshopt.glb"]) {
            const bytes = new Uint8Array(await readFile(fixture(name)));
            await expect(loadWithBareGltfLoader(bytes)).rejects.toThrow();
        }
    });

    it("decodes meshopt", async () => {
        const r = await run("prop-meshopt.glb");
        expect(fix(r, "meshoptDecoded")).toBeDefined();
        expect(outputJson(r).extensionsUsed ?? []).not.toContain(
            "EXT_meshopt_compression",
        );
        await expectLoadsBare(r);
    });

    it("expands GPU instancing", async () => {
        const r = await run("prop-instanced.glb");
        expect(fix(r, "instancesExpanded")).toBeDefined();
        expect(r.report.output!.triangles).toBe(36);
        await expectLoadsBare(r);
    });

    it("strips extras, extensions, animations, cameras, morphs and scenes", async () => {
        const r = await run("prop-extras-and-content.glb");
        expect(fix(r, "extrasStripped")).toBeDefined();
        expect(fix(r, "extensionsStripped")?.extensions).toEqual([
            "KHR_materials_clearcoat",
        ]);
        expect(fix(r, "contentStripped")).toEqual({
            code: "contentStripped",
            animations: 1,
            cameras: 1,
            morphTargets: 1,
            scenes: 1,
        });
        const json = outputJson(r);
        expect(json.animations).toBeUndefined();
        expect(json.cameras).toBeUndefined();
        expect(json.scenes).toHaveLength(1);
        await expectLoadsBare(r);
    });

    it("renormalizes more than 4 influences to 4", async () => {
        const r = await run("garment-influences.glb");
        expect(fix(r, "influencesRenormalized")!.vertices).toBeGreaterThan(0);
        expect(r.report.source!.maxInfluences).toBe(6);
        expect(r.report.output!.maxInfluences).toBe(4);
        const json = outputJson(r);
        const attrs = json.meshes[0].primitives[0].attributes;
        expect(attrs.JOINTS_1).toBeUndefined();
        expect(attrs.WEIGHTS_1).toBeUndefined();
        await expectLoadsBare(r);
    });
});

describe("quiet notes", () => {
    /** `model.gltf` with its resources, after editing its JSON. */
    async function editedGltf(edit: (json: any) => void) {
        const file = await readModelFile(fixture("model.gltf"));
        const json = JSON.parse(new TextDecoder().decode(file.bytes));
        edit(json);
        return {
            ...file,
            bytes: new TextEncoder().encode(JSON.stringify(json)),
        };
    }

    it("counts validator warnings without blocking", async () => {
        const r = await run("garment-clean.glb");
        expect(note(r, "validatorWarnings")!.count).toBeGreaterThan(0);
        expect(r.report.status).toBe("ready");
    });

    it("ignores a stamp kind it doesn't know, and asks", async () => {
        const r = await importModel(
            await editedGltf((json) => {
                json.scenes[0].extras.openmarch.kind = "hat";
            }),
        );
        expect(note(r, "unknownStampKind")?.value).toBe("hat");
        expect(r.report.status).toBe("needs-kind");
    });

    it("keeps a slot on one of two identical meshes", async () => {
        const doc = new Document();
        const buffer = doc.createBuffer();
        const position = doc
            .createAccessor()
            .setType("VEC3")
            .setBuffer(buffer)
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
        const uv = doc
            .createAccessor()
            .setType("VEC2")
            .setBuffer(buffer)
            .setArray(new Float32Array([0, 0, 1, 0, 0, 1]));
        const material = doc.createMaterial("Panel");
        const panel = (name: string) =>
            doc
                .createMesh(name)
                .addPrimitive(
                    doc
                        .createPrimitive()
                        .setAttribute("POSITION", position)
                        .setAttribute("TEXCOORD_0", uv)
                        .setMaterial(material),
                );
        const plain = panel("Back");
        const slotted = panel("Front").setExtras({
            openmarch: {
                artworkSlot: { id: "front", widthM: 1, heightM: 1 },
            },
        });
        const scene = doc.createScene();
        scene.addChild(doc.createNode("Back").setMesh(plain));
        scene.addChild(
            doc.createNode("Front").setMesh(slotted).setTranslation([2, 0, 0]),
        );
        const r = await importModel(
            {
                filename: "panels.glb",
                bytes: await new NodeIO().writeBinary(doc),
            },
            { kind: "prop" },
        );
        expect(note(r, "slotDropped")).toBeUndefined();
        const slot = r.output!.sidecar.artworkSlots[0];
        expect(slot.id).toBe("front");
        const json = outputJson(r);
        const mesh = json.meshes[(slot.target as { mesh: number }).mesh];
        expect(mesh.name).toBe("Front");
        // The geometry is still shared.
        expect(json.accessors.length).toBeLessThan(4);
    });

    it("notes a slot without UVs, and drops one that points nowhere", async () => {
        const r = await importModel(
            await editedGltf((json) => {
                const prim = json.meshes[0].primitives[0];
                delete prim.attributes.TEXCOORD_0;
                delete json.materials[0].pbrMetallicRoughness.baseColorTexture;
            }),
            {
                choices: {
                    slots: [
                        { material: 0, id: "face", widthM: 1.2, heightM: 0.6 },
                        { material: 9, id: "ghost", widthM: 1, heightM: 1 },
                    ],
                },
            },
        );
        expect(note(r, "slotWithoutUVs")?.slot).toBe("face");
        expect(note(r, "slotDropped")?.slot).toBe("ghost");
        expect(r.output!.sidecar.artworkSlots).toMatchObject([
            { id: "face", hasUVs: false },
        ]);
    });
});

describe("Garments", () => {
    it("imports a v4 Garment ready for the shared bake", async () => {
        const r = await run("garment-clean.glb");
        expect(r.report.cantImport).toEqual([]);
        expect(r.report.needsChoice).toEqual([]);
        expect(note(r, "missingFits")?.bodyTypes).toEqual([
            "neutral-slim",
            "neutral-athletic",
            "neutral-full",
            "feminine-average",
            "masculine-average",
        ]);
        expect(r.report.output!.trianglesByFit).toEqual({
            "neutral-average": 192,
            "neutral-broad": 192,
        });
        const sidecar = r.output!.sidecar;
        expect(sidecar.garment!.fits).toEqual([
            "neutral-average",
            "neutral-broad",
        ]);
        expect(Object.keys(sidecar.garment!.meshesByFit)).toEqual([
            "neutral-average",
            "neutral-broad",
        ]);
        expect(sidecar.garment!.meshesByFit["neutral-average"]).toHaveLength(1);
        expect(sidecar.garment!.meshesByFit["neutral-broad"]).toHaveLength(1);
        expect(note(r, "duplicateFits")).toBeUndefined();
        expect(sidecar.stretch).toBeNull();
        expect(note(r, "noStretchZones")).toBeUndefined();

        const gltf = await expectLoadsBare(r);
        const skinned: SkinnedMesh[] = [];
        gltf.scene.traverse((o) => {
            if ((o as SkinnedMesh).isSkinnedMesh)
                skinned.push(o as SkinnedMesh);
        });
        expect(skinned).toHaveLength(2);
        for (const mesh of skinned) {
            expect(
                mesh.skeleton.bones.map((b) => b.userData.name ?? b.name),
            ).toHaveLength(23);
            mesh.skeleton.boneInverses.forEach((m, i) => {
                m.elements.forEach((v, k) =>
                    expect(v).toBeCloseTo(V4_INVERSE_BIND_MATRICES[i][k], 5),
                );
            });
            expect(mesh.geometry.getAttribute("_part")).toBeDefined();
        }
        // Joint names in v4 order, from the raw JSON.
        const json = outputJson(r);
        expect(
            json.skins[0].joints.map((j: number) => json.nodes[j].name),
        ).toEqual([...V4_JOINT_NAMES]);
    });

    it("notes a body type claimed by more than one mesh", async () => {
        const r = await run("garment-duplicate-fit.glb");
        expect(r.report.cantImport).toEqual([]);
        expect(note(r, "duplicateFits")?.fits).toEqual([
            { bodyType: "neutral-average", nodes: ["Jacket0", "Jacket1"] },
        ]);
        const { garment } = r.output!.sidecar;
        expect(garment!.fits).toEqual(["neutral-average", "neutral-broad"]);
        expect(garment!.meshesByFit["neutral-average"]).toHaveLength(2);
        await expectLoadsBare(r);
    });

    it("converts a centimeter, Z-up Garment onto the v4 rest pose", async () => {
        const r = await run("garment-cm-z-up.glb");
        expect(r.report.cantImport).toEqual([]);
        expect(choice(r, "unitConversion")?.applied).toBe("cm");
        expect(choice(r, "rotateToYUp")?.applied).toBe(true);
        const { min, max } = r.output!.sidecar.bounds;
        expect(min[1]).toBeCloseTo(0.9, 4);
        expect(max[1]).toBeCloseTo(1.4, 4);
        await expectLoadsBare(r);

        // Without the conversion it is off the rest pose.
        const raw = await run("garment-cm-z-up.glb", {
            choices: { unitConversion: "none", rotateToYUp: false },
        });
        expect(rejection(raw, "garmentRestPoseMismatch")).toBeDefined();
    });
});

describe("stages", () => {
    const ALL: ModelImportStage[] = [
        "reading",
        "validating",
        "decoding",
        "checking",
        "converting",
        "writing",
    ];

    async function stagesOf(
        go: (options: ModelImportOptions) => Promise<ModelImportResult>,
    ) {
        const stages: ModelImportStage[] = [];
        const result = await go({ onStage: (s) => stages.push(s) });
        return { stages, result };
    }

    it("reports every stage once, in order, for a ready file", async () => {
        const { stages, result } = await stagesOf((o) =>
            run("equipment-clean-kit.glb", o),
        );
        expect(result.report.status).toBe("ready");
        expect(stages).toEqual(ALL);
    });

    it("reports the same stages from importModel on bytes", async () => {
        const bytes = new Uint8Array(
            await readFile(fixture("equipment-clean-kit.glb")),
        );
        const { stages } = await stagesOf((o) =>
            importModel({ filename: "kit.glb", bytes }, o),
        );
        expect(stages).toEqual(ALL);
    });

    it.each<[string, () => Promise<ModelFileInput | string>, ModelImportStage]>(
        [
            [
                "an unreadable container",
                async () => ({
                    filename: "notes.glb",
                    bytes: new TextEncoder().encode("hello"),
                }),
                "reading",
            ],
            [
                "a missing resource",
                async () => ({
                    filename: "model.gltf",
                    bytes: new Uint8Array(
                        await readFile(fixture("model.gltf")),
                    ),
                }),
                "reading",
            ],
            ["validator errors", async () => "invalid.glb", "validating"],
            [
                "a disallowed required extension",
                async () => "prop-required-extension.glb",
                "validating",
            ],
            [
                "over 4× the triangle cap",
                async () => "equipment-over-4x.glb",
                "checking",
            ],
            ["a rig on a prop", async () => "prop-rigged.glb", "checking"],
        ],
    )("stops at the stage that rejects %s", async (_, file, last) => {
        const source = await file();
        const { stages, result } = await stagesOf((o) =>
            typeof source === "string"
                ? run(source, o)
                : importModel(source, o),
        );
        expectRejected(result);
        expect(stages).toEqual(ALL.slice(0, ALL.indexOf(last) + 1));
    });

    it("stops after decoding when the kind is needed", async () => {
        const { stages, result } = await stagesOf((o) =>
            run("prop-no-extras.glb", o),
        );
        expect(result.report.status).toBe("needs-kind");
        expect(stages).toEqual(["reading", "validating", "decoding"]);
    });

    it("imports the same when the callback throws or rejects", async () => {
        const plain = await run("equipment-clean-kit.glb");
        const thrown = await run("equipment-clean-kit.glb", {
            onStage: () => {
                throw new Error("progress broke");
            },
        });
        const rejecting = await run("equipment-clean-kit.glb", {
            onStage: async () => {
                throw new Error("progress broke");
            },
        });
        for (const r of [thrown, rejecting]) {
            expect(r.report).toEqual(plain.report);
            expect(r.output!.glb).toEqual(plain.output!.glb);
        }
    });
});
