import { create } from "zustand";
import type { View3dCameraPose } from "@/view3d/sync/protocol";

/**
 * The 3D View's camera as the 2D field shows it (#1207): the window's latest
 * pose, or the one the viewer is dragging on the field (the window's own
 * reports wait until the drag ends, so the marker doesn't jump back).
 */
export interface FieldCameraState {
    pose: View3dCameraPose | null;
    dragging: boolean;
    /** When the last drag ended (`performance.now()`), so poses sent before it don't jump the marker back */
    settledAt: number;
}

/** How long after a drag the window's reports wait, for the last move to reach it and come back. */
export const SETTLE_MS = 400;

export const useFieldCameraStore = create<FieldCameraState>(() => ({
    pose: null,
    dragging: false,
    settledAt: 0,
}));
