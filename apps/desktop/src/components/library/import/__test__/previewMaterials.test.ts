// @vitest-environment node
/**
 * The artwork surface highlight (Q67) end to end below the UI: the pipeline
 * reports each source material's index in the normalized GLB, and the
 * preview finds that material among what bare `GLTFLoader` made from it.
 */
import path from "node:path";
import { Color, type Mesh, type MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { importModelFile } from "../../../../../electron/main/model-import/pipeline";
import { loadWithBareGltfLoader } from "../../../../../electron/main/model-import/__test__/gltfLoader";
import {
    highlightMaterials,
    materialIndexOf,
    tagMaterials,
} from "../previewMaterials";

const FIXTURES = path.join(
    __dirname,
    "../../../../../electron/main/model-import/__test__/fixtures",
);

async function loaded(name: string) {
    const result = await importModelFile(path.join(FIXTURES, name));
    const { gltf } = await loadWithBareGltfLoader(result.output!.glb);
    tagMaterials(gltf.scene, gltf.parser.associations);
    const byMesh = (meshName: string) => {
        let found: MeshStandardMaterial | null = null;
        gltf.scene.traverse((o) => {
            if ((o as Mesh).isMesh && o.name === meshName)
                found = (o as Mesh).material as MeshStandardMaterial;
        });
        return found as MeshStandardMaterial | null;
    };
    return { report: result.report, scene: gltf.scene, byMesh };
}

describe("preview materials", () => {
    it("finds a source material in the preview through its output index", async () => {
        const { report, byMesh } = await loaded("equipment-clean-kit.glb");
        for (const info of report.materials) {
            const material = byMesh(info.name === "Silk" ? "Silk" : "Pole")!;
            expect(material.name).toBe(info.name);
            expect(materialIndexOf(material)).toBe(info.outputIndex);
        }
    });

    it("lights only the chosen material, and restores it after", async () => {
        const { report, scene, byMesh } = await loaded(
            "equipment-clean-kit.glb",
        );
        const silk = report.materials.find((m) => m.name === "Silk")!;
        const accent = new Color("#967eff");
        const silkMaterial = byMesh("Silk")!;
        const poleMaterial = byMesh("Pole")!;
        const before = silkMaterial.emissive.getHex();
        const baseColor = silkMaterial.color.getHex();

        highlightMaterials(scene, silk.outputIndex, accent);
        expect(silkMaterial.emissive.getHex()).toBe(accent.getHex());
        expect(silkMaterial.color.getHex()).not.toBe(baseColor);
        expect(poleMaterial.emissive.getHex()).toBe(before);
        // Lighting it again doesn't tint it twice.
        const tinted = silkMaterial.color.getHex();
        highlightMaterials(scene, silk.outputIndex, accent);
        expect(silkMaterial.color.getHex()).toBe(tinted);

        highlightMaterials(scene, null, accent);
        expect(silkMaterial.emissive.getHex()).toBe(before);
        expect(silkMaterial.color.getHex()).toBe(baseColor);
    });
});
