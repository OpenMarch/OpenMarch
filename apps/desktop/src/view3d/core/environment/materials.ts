// cspell:ignore metalness
import {
    BoxGeometry,
    MeshStandardMaterial,
    type MeshStandardMaterialParameters,
} from "three";

/**
 * Shared geometry and materials (concrete, metal, seats, glass), so kits keep
 * their draw calls low. One instance per scene; the owner calls `dispose()`.
 */
export interface SharedMaterials {
    /** A 1 x 1 x 1 box centered on the origin. Scale it per instance or mesh. */
    unitBox: BoxGeometry;
    concrete: MeshStandardMaterial;
    /** Light bench / railing metal. */
    bench: MeshStandardMaterial;
    metal: MeshStandardMaterial;
    seat: MeshStandardMaterial;
    glass: MeshStandardMaterial;
    /** Creates a material (roughness 0.85 by default) that `dispose()` also frees. */
    std(
        color: number,
        params?: MeshStandardMaterialParameters,
    ): MeshStandardMaterial;
    dispose(): void;
}

export function createSharedMaterials(): SharedMaterials {
    const owned: MeshStandardMaterial[] = [];
    const unitBox = new BoxGeometry(1, 1, 1);
    const std = (
        color: number,
        params: MeshStandardMaterialParameters = {},
    ) => {
        const m = new MeshStandardMaterial({
            color,
            roughness: 0.85,
            ...params,
        });
        owned.push(m);
        return m;
    };
    return {
        unitBox,
        concrete: std(0x8e9098, { roughness: 0.95 }),
        bench: std(0xc8ccd4, { metalness: 0.5, roughness: 0.45 }),
        metal: std(0x9a9da4, { metalness: 0.6, roughness: 0.4 }),
        seat: std(0x1f3f8f, { roughness: 0.8 }),
        glass: std(0x16202e, {
            roughness: 0.15,
            metalness: 0.5,
            emissive: 0x3a3020,
            emissiveIntensity: 0.6,
        }),
        std,
        dispose() {
            unitBox.dispose();
            owned.forEach((m) => {
                m.map?.dispose();
                m.emissiveMap?.dispose();
                m.dispose();
            });
            owned.length = 0;
        },
    };
}
