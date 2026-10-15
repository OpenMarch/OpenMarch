// cspell:words lerp
/**
 * Finding the import preview's materials again (owner decision Q67): the
 * artwork surface list names source materials, the report maps each to its
 * index in the normalized GLB (`MaterialInfo.outputIndex`), and these
 * helpers find that glTF material among the three.js ones `GLTFLoader`
 * made, to light it.
 */
import type {
    Color,
    Material,
    Mesh,
    MeshStandardMaterial,
    Object3D,
} from "three";
import type { GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

const MATERIAL_INDEX = "importMaterialIndex";

function materialsOf(mesh: Mesh): Material[] {
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/**
 * Stamps each three.js material with its glTF material index, from the
 * loader's associations (which follow its per-mesh clones), so a material
 * can be found again by `MaterialInfo.outputIndex`.
 */
export function tagMaterials(
    scene: Object3D,
    associations: GLTFParser["associations"],
) {
    scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        for (const m of materialsOf(mesh)) {
            const index = associations.get(m)?.materials;
            if (index !== undefined) m.userData[MATERIAL_INDEX] = index;
        }
    });
}

/** The glTF material index stamped on a material, else null. */
export function materialIndexOf(material: Material): number | null {
    const index: unknown = material.userData[MATERIAL_INDEX];
    return typeof index === "number" ? index : null;
}

/**
 * Lights the materials with glTF index `index` in `color` (tinted and
 * glowing, so it shows on a white material too); restores the rest.
 */
export function highlightMaterials(
    scene: Object3D,
    index: number | null,
    color: Color,
) {
    scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        for (const m of materialsOf(mesh)) {
            const lit = m as MeshStandardMaterial;
            if (!lit.emissive || !lit.color) continue;
            const saved = m.userData.importHighlight as
                | { color: Color; emissive: Color; intensity: number }
                | undefined;
            if (index !== null && materialIndexOf(m) === index) {
                if (saved) continue;
                m.userData.importHighlight = {
                    color: lit.color.clone(),
                    emissive: lit.emissive.clone(),
                    intensity: lit.emissiveIntensity,
                };
                lit.color.lerp(color, 0.6);
                lit.emissive.copy(color);
                lit.emissiveIntensity = 0.35;
            } else if (saved) {
                lit.color.copy(saved.color);
                lit.emissive.copy(saved.emissive);
                lit.emissiveIntensity = saved.intensity;
                delete m.userData.importHighlight;
            }
        }
    });
}
