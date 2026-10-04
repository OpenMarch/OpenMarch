/**
 * Camera state for the 3D View window (P3.2, ui.md UI-3). This is the
 * contract between the camera rig (`CameraRig.tsx`) and the overlay (P3.3).
 * The overlay uses only these fields:
 *
 * - `activeCameraId`: the kit camera the view is at or flying to, or null
 *   after the viewer orbits, pans, zooms or picks a seat. Highlight its chip.
 * - `selectCamera(id)`: fly to one of the current kit's cameras
 *   (`useView3dSceneStore().kit.cameras`, in bar order). Ids the kit doesn't
 *   have are ignored.
 * - `pickMode` and `setPickMode(on)`: pick-a-seat. While on, the canvas shows
 *   a crosshair and the next click on a stand moves there; the rig turns it
 *   off after one pick or on Esc. An Esc keydown that cancels pick mode is
 *   `preventDefault()`ed, so a fullscreen Esc handler can skip events with
 *   `defaultPrevented`.
 * - `readout`: eye height above the ground and horizontal distance from the
 *   eye to the kit's focus (the field center), in meters. Updated at most 10
 *   times a second, and only when a value changes by 5 cm or more.
 *
 * Fields starting with `_` are for the rig only.
 */
import { create } from "zustand";
import { useView3dSceneStore } from "../sceneStore";

export interface CameraReadout {
    eyeHeightM: number;
    distanceToFocusM: number;
}

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
    readout: CameraReadout;
    /** Rig only: the latest `selectCamera` call. */
    _request: CameraRequest | null;
    /** Rig only. */
    _setActive: (id: string | null) => void;
    /** Rig only. */
    _setReadout: (readout: CameraReadout) => void;
}

/** Minimum time between readout updates (10 Hz). */
export const READOUT_INTERVAL_MS = 100;
/** Readout changes smaller than this (meters) aren't published. */
export const READOUT_EPSILON_M = 0.05;

export const useCameraStore = create<CameraState>()((set, get) => ({
    activeCameraId: null,
    selectCamera: (id) => {
        const kit = useView3dSceneStore.getState().kit;
        if (kit && !kit.cameras.some((c) => c.id === id)) return;
        set({
            activeCameraId: id,
            pickMode: false,
            _request: { id, seq: (get()._request?.seq ?? 0) + 1 },
        });
    },
    pickMode: false,
    setPickMode: (on) => set({ pickMode: on }),
    readout: { eyeHeightM: 0, distanceToFocusM: 0 },
    _request: null,
    _setActive: (id) => set({ activeCameraId: id }),
    _setReadout: (readout) => set({ readout }),
}));

/**
 * Throttles readout updates to `READOUT_INTERVAL_MS` and skips changes under
 * `READOUT_EPSILON_M`. Returns whether it published.
 */
export function createReadoutThrottle(
    publish: (readout: CameraReadout) => void,
): (readout: CameraReadout, nowMs: number) => boolean {
    let lastAt = -Infinity;
    let last: CameraReadout | null = null;
    return (readout, nowMs) => {
        if (nowMs - lastAt < READOUT_INTERVAL_MS) return false;
        if (
            last &&
            Math.abs(last.eyeHeightM - readout.eyeHeightM) <
                READOUT_EPSILON_M &&
            Math.abs(last.distanceToFocusM - readout.distanceToFocusM) <
                READOUT_EPSILON_M
        )
            return false;
        lastAt = nowMs;
        last = { ...readout };
        publish(last);
        return true;
    };
}
