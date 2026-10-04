/**
 * What the 3D View scene has built, for the camera rig (P3.2) and the overlay
 * (P3.3). `Scene.tsx` (P3.1) is the only writer.
 *
 * - `kit`: the current `KitResult`, or null while nothing is built. Use its
 *   `cameras` for the camera bar, `pickTargets` and `seatRows` for
 *   pick-a-seat, and `lightingPresets` for the lighting control. `kitId` is
 *   the registry id it was built from. Don't dispose it: the scene does.
 * - `crowd`: the crowd handle, or null when the crowd is off or the kit has
 *   no seat rows. The camera rig calls `crowd.clearAround(position,
 *   CROWD_CLEAR_RADIUS)` when the camera lands. The scene clears around the
 *   camera once whenever it builds a crowd.
 * - `focus`: the kit's default look-at point (normally the field center).
 * - `lighting`: the preset actually applied (the stored one, or the kit's
 *   default when the stored one doesn't fit the kit).
 * - `quality`: the render quality the scene builds for. P5.1 lowers it
 *   with `setQuality("low")`; that drops shadows and halves the crowd.
 *
 * Read it in React with `useView3dSceneStore(selector)`, and in `useFrame` or
 * event handlers with `useView3dSceneStore.getState()`.
 *
 * The camera rig (`camera/CameraRig.tsx`, P3.2) places the camera: it
 * watches `kit` and opens each new venue on its default camera.
 */
import type { Vector3Tuple } from "three";
import { create } from "zustand";
import type { Crowd } from "@/view3d/core/environment";
import type {
    KitResult,
    LightingPreset,
    VenueKitId,
} from "@/view3d/core/types";

/** People within this many meters of a seat camera are hidden (ui.md UI-3). */
export const CROWD_CLEAR_RADIUS = 4.9;

export type View3dQuality = "low" | "high";

export interface View3dSceneState {
    kitId: VenueKitId | null;
    kit: KitResult | null;
    crowd: Crowd | null;
    focus: Vector3Tuple;
    lighting: LightingPreset | null;
    quality: View3dQuality;
    setQuality: (quality: View3dQuality) => void;
    /** Scene only. */
    _setKit: (kitId: VenueKitId | null, kit: KitResult | null) => void;
    /** Scene only. */
    _setCrowd: (crowd: Crowd | null) => void;
    /** Scene only. */
    _setLighting: (lighting: LightingPreset | null) => void;
}

const ORIGIN: Vector3Tuple = [0, 0, 0];

export const useView3dSceneStore = create<View3dSceneState>()((set) => ({
    kitId: null,
    kit: null,
    crowd: null,
    focus: ORIGIN,
    lighting: null,
    quality: "high",
    setQuality: (quality) => set({ quality }),
    _setKit: (kitId, kit) =>
        set({ kitId, kit, focus: kit ? kit.focus : ORIGIN }),
    _setCrowd: (crowd) => set({ crowd }),
    _setLighting: (lighting) => set({ lighting }),
}));
