import {
    CylinderGeometry,
    Group,
    Mesh,
    MeshStandardMaterial,
    SpotLight,
    type Vector3Tuple,
} from "three";
import type { SharedMaterials } from "./materials";
import { ft } from "./units";

export interface LightPole {
    /** Pole, lamp head and spot light. Its origin is the pole's base. */
    object: Group;
    /** Turns the lamp on or off; `k` scales the spot (dusk uses 0.6). */
    setOn(on: boolean, k?: number): void;
    dispose(): void;
}

/**
 * A stadium light pole with a lamp head and one spot light. Position `object`
 * at the pole's base. `lookAt` is in the same frame as `object.position` is
 * (the pole's parent), so the head and spot aim at it from wherever you place
 * the pole: pass the target relative to the base. Heights are meters.
 *
 * The pole body uses `shared.metal`, so the caller disposes that with the
 * shared materials; `dispose()` here frees only what the pole created.
 */
export function lightPole(
    height: number,
    lookAt: Vector3Tuple,
    shared: SharedMaterials,
): LightPole {
    const object = new Group();
    object.name = "lightPole";
    const poleGeo = new CylinderGeometry(ft(0.9), ft(1.4), height, 10);
    const pole = new Mesh(poleGeo, shared.metal);
    pole.position.y = height / 2;
    pole.castShadow = true;

    const headMat = new MeshStandardMaterial({
        color: 0x30333a,
        roughness: 0.85,
        emissive: 0xffffff,
        emissiveIntensity: 0,
    });
    const headY = height + ft(4);
    const head = new Mesh(shared.unitBox, headMat);
    head.scale.set(ft(22), ft(12), ft(2));
    head.position.set(0, headY, 0);
    head.lookAt(lookAt[0], headY, lookAt[2]);

    const spot = new SpotLight(0xfff3e0, 0, 0, 0.62, 0.6, 0);
    spot.position.set(0, headY, 0);
    spot.target.position.set(...lookAt);
    object.add(pole, head, spot, spot.target);

    return {
        object,
        setOn(on, k = 1) {
            headMat.emissiveIntensity = on ? 2.2 : 0;
            spot.intensity = on ? 1.6 * k : 0;
        },
        dispose() {
            poleGeo.dispose();
            headMat.dispose();
            spot.dispose();
        },
    };
}
