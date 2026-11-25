/**
 * Camera state for the 3D View window (P3.2, ui.md UI-3). This is the
 * contract between the camera rig (`CameraRig.tsx`) and the overlay (P3.3).
 * The overlay uses only these fields:
 *
 * - `activeCameraId`: the kit camera the view is at or flying to, or null
 *   after the viewer orbits, pans, zooms or picks a seat. Highlight its chip.
 * - `selectCamera(id)`: fly to one of the listed cameras
 *   (`useView3dSceneStore().cameras`, in menu order). A camera that follows
 *   a performer goes to them and keeps following. Ids not listed are
 *   ignored.
 * - `pickMode` and `setPickMode(on)`: pick-a-seat. While on, the canvas shows
 *   a crosshair and the next click on a stand moves there; the rig turns it
 *   off after one pick or on Esc. An Esc keydown that cancels pick mode is
 *   `preventDefault()`ed, so a fullscreen Esc handler can skip events with
 *   `defaultPrevented`.
 * - `markActive(id)`: the view is already at camera `id` (it was just saved
 *   there), so highlight it without flying.
 * - `showPose(pose, focus)`: puts the view at `pose` at once, with `focus`,
 *   as a free view (typed or scrubbed camera settings, before they are
 *   saved). It stops following and the Director.
 * - `focus`: what the view keeps sharp, or null for everything. Choosing a
 *   camera sets it to the camera's; orbiting, panning and zooming keep it;
 *   following a performer with P and the Director clear it.
 * - `focusDistance()`: meters from the camera to what is in focus now, or
 *   null when nothing is.
 * - `currentPose()`: the view right now (eye, look-at point, field of
 *   view, roll), for saving it as a camera. Null before the rig mounts.
 *
 * Fields starting with `_` are for the rig only.
 */
import { create } from "zustand";
import { useView3dSceneStore } from "../sceneStore";
import type { CameraFocus, ViewPose } from "@/view3d/core/cameraList";

/** A pending fly-to. `seq` changes on every request, even for the same id. */
export interface CameraRequest {
    id: string;
    seq: number;
}

export interface CameraState {
    activeCameraId: string | null;
    selectCamera: (id: string) => void;
    pickMode: boolean;
    setPickMode: (on: boolean) => void;
    markActive: (id: string) => void;
    showPose: (pose: ViewPose, focus: CameraFocus | null) => void;
    focus: CameraFocus | null;
    focusDistance: () => number | null;
    currentPose: () => ViewPose | null;
    /** Rig only: sets where `focusDistance` reads from. */
    _setFocusSource: (source: (() => number | null) | null) => void;
    /** Rig only. */
    _setFocus: (focus: CameraFocus | null) => void;
    /** Rig only: the latest `showPose` call. */
    _shown: { pose: ViewPose; seq: number } | null;
    /** Rig only: sets where `currentPose` reads from. */
    _setPoseSource: (source: (() => ViewPose) | null) => void;
    /** Rig only: the latest `selectCamera` call. */
    _request: CameraRequest | null;
    /** Rig only. */
    _setActive: (id: string | null) => void;
}

let poseSource: (() => ViewPose) | null = null;
let focusSource: (() => number | null) | null = null;

export const useCameraStore = create<CameraState>()((set, get) => ({
    activeCameraId: null,
    selectCamera: (id) => {
        const { kit, cameras } = useView3dSceneStore.getState();
        if (kit && !cameras.some((c) => c.id === id)) return;
        set({
            activeCameraId: id,
            pickMode: false,
            _request: { id, seq: (get()._request?.seq ?? 0) + 1 },
        });
    },
    pickMode: false,
    setPickMode: (on) => set({ pickMode: on }),
    markActive: (id) => set({ activeCameraId: id, pickMode: false }),
    showPose: (pose, focus) =>
        set({
            pickMode: false,
            focus,
            _shown: { pose, seq: (get()._shown?.seq ?? 0) + 1 },
        }),
    focus: null,
    focusDistance: () => (get().focus ? (focusSource?.() ?? null) : null),
    _setFocusSource: (source) => {
        focusSource = source;
    },
    _setFocus: (focus) => {
        if (get().focus !== focus) set({ focus });
    },
    _shown: null,
    currentPose: () => poseSource?.() ?? null,
    _setPoseSource: (source) => {
        poseSource = source;
    },
    _request: null,
    _setActive: (id) => set({ activeCameraId: id }),
}));
