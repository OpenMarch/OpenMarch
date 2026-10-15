// @vitest-environment node
/**
 * The Starter kit's round trip (package C1.13): each template, exported by
 * the "OpenMarch Tools" add-on in Blender (`pnpm run kit:build`), imports
 * through the model pipeline (C1.7) with nothing to ask and nothing refused,
 * and its kind, grips, artwork slots, stretch zones and stamp come through.
 *
 * Also checks that the add-on's pre-flight predicts what the importer says,
 * on the deliberately broken cases in `fixtures/` (same build).
 *
 * Uses the committed exports; Blender isn't needed to run these.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { v5 as uuidv5 } from "uuid";
import { describe, expect, it } from "vitest";
import { parseContainer } from "../../model-import/container";
import { importModelFile } from "../../model-import/pipeline";
import type { ModelImportResult } from "../../model-import/types";
import { loadWithBareGltfLoader } from "../../model-import/__test__/gltfLoader";
import { readKitVersion } from "../kit";
import { asksArtworkSurface } from "@/components/library/import/importReview";

const KIT = path.resolve(__dirname, "../../../../starter-kit");
const CASES = path.join(__dirname, "fixtures");
/** The namespace `build_kit.py` names the examples' item ids in. */
const EXAMPLE_NAMESPACE = "a7f3e2c4-0b8d-4c5e-9f61-2d3b4a5c6e70";
const FT = 0.3048;

const example = (name: string) => path.join(KIT, "examples", `${name}.glb`);

/** The file's own `extras.openmarch` on the scene, before import strips it. */
async function sceneStamp(file: string): Promise<Record<string, unknown>> {
    const { json } = parseContainer(new Uint8Array(await readFile(file)));
    const scenes = json.scenes as { extras?: { openmarch?: object } }[];
    return scenes[0].extras!.openmarch as Record<string, unknown>;
}

async function expectClean(r: ModelImportResult) {
    expect(r.report.status).toBe("ready");
    expect(r.report.cantImport).toEqual([]);
    expect(r.report.needsChoice).toEqual([]);
    expect(r.report.fixedForYou).toEqual([]);
    expect(r.report.notes).toEqual([]);
    expect(r.report.badges).toEqual([]);
    expect(r.report.kindSource).toBe("stamp");
    // the review adds its own Needs your choice row for an unmarked surface
    expect(asksArtworkSurface(r.report)).toBe(false);
    const { errors } = await loadWithBareGltfLoader(r.output!.glb);
    expect(errors).toEqual([]);
}

describe("Starter kit examples import cleanly", async () => {
    const kitVersion = await readKitVersion(KIT);

    const stampOf = (name: string, kind: string) => ({
        itemId: uuidv5(name, EXAMPLE_NAMESPACE),
        kind,
        kitVersion,
    });

    it("equipment: the flag pole", async () => {
        const name = "equipment-flag-pole";
        const r = await importModelFile(example(name));
        await expectClean(r);
        const sidecar = r.output!.sidecar;
        expect(sidecar.kind).toBe("equipment");
        expect(sidecar.stamp).toEqual(stampOf(name, "equipment"));
        expect(sidecar.metadata.generator).toMatch(/Blender I\/O v4\.2/);
        // Grips up the pole, with the grip frame's +Z along it (+Y).
        expect(sidecar.grips.right!.position[1]).toBeCloseTo(0.3, 5);
        expect(sidecar.grips.left!.position[1]).toBeCloseTo(0.9, 5);
        for (const grip of [sidecar.grips.right!, sidecar.grips.left!]) {
            const [x, y, z, w] = grip.rotation;
            expect(x).toBeCloseTo(-Math.SQRT1_2, 5);
            expect(y).toBeCloseTo(0, 5);
            expect(z).toBeCloseTo(0, 5);
            expect(w).toBeCloseTo(Math.SQRT1_2, 5);
        }
        expect(sidecar.attachPoints).toEqual({});
        expect(sidecar.artworkSlots).toEqual([]);
        expect(sidecar.stretch).toEqual({ x: null, y: [1, 1.7], z: null });
        // Six feet of pole plus the finial's top half.
        expect(sidecar.bounds.size[1]).toBeCloseTo(6 * FT + 0.0254, 4);
    });

    it("prop: the standing flat", async () => {
        const name = "prop-flat";
        const r = await importModelFile(example(name));
        await expectClean(r);
        const sidecar = r.output!.sidecar;
        expect(sidecar.kind).toBe("prop");
        expect(sidecar.stamp).toEqual(stampOf(name, "prop"));
        expect(sidecar.grips).toEqual({ right: null, left: null });
        expect(
            sidecar.artworkSlots.map(({ id, widthM, heightM, hasUVs }) => ({
                id,
                widthM,
                heightM,
                hasUVs,
            })),
        ).toEqual([
            { id: "front", widthM: 4 * FT, heightM: 8 * FT, hasUVs: true },
            { id: "back", widthM: 4 * FT, heightM: 8 * FT, hasUVs: true },
        ]);
        expect(sidecar.stretch).toEqual({
            x: [-0.4, 0.4],
            y: [0.2, 2.2],
            z: null,
        });
        expect(sidecar.bounds.size[0]).toBeCloseTo(4 * FT, 4);
        expect(sidecar.bounds.size[1]).toBeCloseTo(8 * FT, 4);
    });

    it("floor prop: the panel", async () => {
        const name = "floor-prop-panel";
        const r = await importModelFile(example(name));
        await expectClean(r);
        const sidecar = r.output!.sidecar;
        expect(sidecar.kind).toBe("floorProp");
        expect(sidecar.stamp).toEqual(stampOf(name, "floorProp"));
        expect(sidecar.artworkSlots).toHaveLength(1);
        expect(sidecar.artworkSlots[0]).toMatchObject({
            id: "top",
            widthM: 4 * FT,
            heightM: 8 * FT,
            hasUVs: true,
        });
        // Blender's Y (depth) zone comes out along -Z, flipped.
        expect(sidecar.stretch).toEqual({
            x: [-0.5, 0.5],
            y: null,
            z: [-1.1, 1.1],
        });
        expect(sidecar.bounds.size[2]).toBeCloseTo(8 * FT, 4);
    });

    it("stamps the export license beside the kit stamp, and the importer reads it", async () => {
        for (const name of [
            "equipment-flag-pole",
            "prop-flat",
            "floor-prop-panel",
        ]) {
            expect(await sceneStamp(example(name))).toMatchObject({
                license: "CC0-1.0",
                kitVersion,
            });
            // and the importer reads it, to pre-fill the review's license
            const r = await importModelFile(example(name));
            expect(r.report.metadata.license).toBe("CC0-1.0");
        }
    });
});

describe("the add-on's pre-flight agrees with the importer", async () => {
    const predictions = JSON.parse(
        await readFile(path.join(CASES, "predictions.json"), "utf8"),
    ) as Record<
        string,
        { kind: string | null; cant: string[]; choice: string[] }
    >;

    it("has the cases", () => {
        expect(Object.keys(predictions).sort()).toEqual([
            "equipment-centimeters",
            "equipment-dense",
            "equipment-lying",
            "equipment-no-grip",
            "floor-standing",
            "no-kind",
            "prop-rigged",
        ]);
    });

    for (const [name, predicted] of Object.entries(predictions)) {
        it(name, async () => {
            const r = await importModelFile(path.join(CASES, `${name}.glb`));
            expect(r.report.kind).toBe(predicted.kind);
            expect(r.report.cantImport.map((row) => row.code).sort()).toEqual(
                predicted.cant,
            );
            expect(r.report.needsChoice.map((row) => row.code).sort()).toEqual(
                predicted.choice,
            );
        });
    }
});
