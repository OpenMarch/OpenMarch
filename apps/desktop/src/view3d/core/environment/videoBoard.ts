import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import type { ShowCredits } from "../types";
import type { SharedMaterials } from "./materials";
import { creditsBoardTexture } from "./signage";
import { ft } from "./units";

export interface VideoBoard {
    /**
     * Centered on its origin, facing +Z. With `legHeight > 0` the legs hang
     * below the screen, so place the origin at screen center height.
     */
    object: Group;
    /** Shows the show's credits on the screen (cheap to repeat). */
    setCredits(credits: ShowCredits): void;
    dispose(): void;
}

/**
 * A video board: dark frame, an emissive screen with the show's credits card
 * (blank until `setCredits`), and
 * optional legs. `w`, `h` and `legHeight` are meters (the screen size).
 */
export function videoBoard(
    w: number,
    h: number,
    legHeight: number,
    shared: SharedMaterials,
): VideoBoard {
    const object = new Group();
    object.name = "videoBoard";
    const margin = ft(4);
    const frameMat = shared.std(0x1a1b20);
    const frame = new Mesh(shared.unitBox, frameMat);
    frame.scale.set(w + margin, h + margin, ft(3));
    frame.castShadow = true;

    const { texture: map, setCredits } = creditsBoardTexture(w / h);
    const screenMat = new MeshStandardMaterial({
        color: 0x000000,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 0.9,
    });
    const screenGeo = new PlaneGeometry(w, h);
    const screen = new Mesh(screenGeo, screenMat);
    screen.position.z = ft(1.6);
    object.add(frame, screen);

    if (legHeight > 0) {
        const legMat = shared.std(0x5c5f66);
        for (const sx of [-1, 1]) {
            const leg = new Mesh(shared.unitBox, legMat);
            leg.scale.set(ft(3), legHeight, ft(3));
            leg.position.set(sx * w * 0.3, -h / 2 - legHeight / 2, 0);
            leg.castShadow = true;
            object.add(leg);
        }
    }

    return {
        object,
        setCredits,
        dispose() {
            screenGeo.dispose();
            map.dispose();
            screenMat.dispose();
        },
    };
}
