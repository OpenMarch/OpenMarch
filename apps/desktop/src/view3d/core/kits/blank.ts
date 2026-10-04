import { Group, type Vector3Tuple } from "three";
import { createSharedMaterials, ft } from "../environment";
import type { KitBuilder } from "../types";
import {
    GROUND_SIZE,
    GROUND_Y,
    OUTDOOR_PRESETS,
    blimpCamera,
    cameraSeat,
    frameOf,
    groundPlane,
    topDownCamera,
} from "./stands";

/**
 * Blank kit (design.md section 6, P2.3): the field on a plain neutral ground.
 * No stands, crowd or poles. Day, dusk and night; default day. The shared rig
 * does all the lighting, so `setLighting` has nothing to switch.
 */
export const buildBlank: KitBuilder = (input) => {
    const f = frameOf(input.footprint);
    const shared = createSharedMaterials();
    const root = new Group();
    root.name = "kit:blank";
    const ground = groundPlane(
        GROUND_SIZE,
        GROUND_SIZE,
        shared.std(0x8c8f96, { roughness: 1 }),
        f.cx,
        GROUND_Y,
        f.cz,
        "ground",
    );
    root.add(ground.mesh);

    const focus: Vector3Tuple = [f.cx, 0, f.cz];
    return {
        root,
        focus,
        cameras: [
            cameraSeat(
                "frontRow",
                "seat",
                [f.cx - ft(36), ft(5.6), f.maxZ + ft(60)],
                [f.cx - ft(12), ft(6), f.cz],
            ),
            cameraSeat(
                "endZone",
                "seat",
                [f.maxX + ft(70), ft(28), f.cz],
                [f.cx, 0, f.cz],
            ),
            blimpCamera(f),
            topDownCamera(f, ft(620)),
        ],
        seatRows: [],
        pickTargets: [],
        lightingPresets: [...OUTDOOR_PRESETS],
        defaultLighting: "day",
        setLighting() {},
        dispose() {
            ground.geometry.dispose();
            shared.dispose();
        },
    };
};
