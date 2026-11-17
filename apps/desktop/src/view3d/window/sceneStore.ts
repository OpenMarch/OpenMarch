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
 * - `cameras`: the cameras the menu lists and keys 1–9 pick, in order: the
 *   kit's defaults, or the show's own list for this kit (`cameraList.ts`).
 *   `camerasCustomized` says which. The scene keeps the show's lists
 *   (`view3d_cameras`) in `savedCameras` with `_setSavedCameras`.
 * - `focus`: the kit's default look-at point (normally the field center).
 * - `lighting`: the preset actually applied (the stored one, or the kit's
 *   default when the stored one doesn't fit the kit).
 * - `quality`: the render quality the scene builds for. `low` drops
 *   shadows and halves the crowd.
 * - `onBattery`: the window's own reading of the battery; on battery the
 *   frame rate is capped (`drawPolicy.ts`).
 * - `qualityMode`: the viewer's choice in the settings panel (`auto`, `low`
 *   or `high`), saved per computer. Set it with `setQualityMode`. In `auto`
 *   the scene lowers `quality` once with `_autoLower()` when frames are slow
 *   (P5.1), and `autoLowered` says so.
 * - `resolution`: the most device pixels drawn per screen pixel
 *   (`renderPrefs.ts`), saved per computer. Set it with `setResolution`.
 * - `softwareGl`: WebGL draws in software here (SwiftShader, llvmpipe,
 *   Microsoft Basic Render), which `View3dRoot` probes before the scene
 *   mounts. Then `quality` stays `low` whatever the mode, like the 2D field's
 *   low-quality mode (`fieldQuality.ts`); `low` also draws at 1x.
 *
 * - `controlScheme`: what dragging and scrolling do (`controlScheme.ts`),
 *   saved per computer. Set it with `setControlScheme`.
 * - `pausedPose`: how marchers stand while the show is paused, the closed
 *   position or the actual step (`pausedPose.ts`), saved per computer. The
 *   transport bar toggles it with `setPausedPose`.
 *
 * The app's Settings window saves the quality, power, resolution and controls choices;
 * `startPrefsSync()` picks them up while the window is open.
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
import {
    resolveCameras,
    type ShowVenueCameras,
    type ViewCamera,
} from "@/view3d/core/cameraList";
import type {
    KitResult,
    LightingPreset,
    VenueKitId,
} from "@/view3d/core/types";
import {
    QUALITY_STORAGE_KEY,
    initialQuality,
    loadQualityMode,
    saveQualityMode,
    type QualityMode,
} from "./qualityPreference";
import {
    RESOLUTION_STORAGE_KEY,
    loadResolution,
    saveResolution,
    type Resolution,
} from "./renderPrefs";
import {
    CONTROL_SCHEME_STORAGE_KEY,
    loadControlScheme,
    saveControlScheme,
    type ControlScheme,
} from "./camera/controlScheme";
import {
    PAUSED_POSE_STORAGE_KEY,
    loadPausedPose,
    savePausedPose,
    type PausedPose,
} from "./pausedPose";

/** People within this many meters of a seat camera are hidden (ui.md UI-3). */
export const CROWD_CLEAR_RADIUS = 4.9;

export type View3dQuality = "low" | "high";

export interface View3dSceneState {
    kitId: VenueKitId | null;
    kit: KitResult | null;
    crowd: Crowd | null;
    cameras: ViewCamera[];
    camerasCustomized: boolean;
    savedCameras: ShowVenueCameras | undefined;
    focus: Vector3Tuple;
    lighting: LightingPreset | null;
    quality: View3dQuality;
    setQuality: (quality: View3dQuality) => void;
    onBattery: boolean;
    /** Scene only: the battery reading changed. */
    _setOnBattery: (onBattery: boolean) => void;
    qualityMode: QualityMode;
    /** Saves the choice and applies it. Choosing `auto` starts on `high` again. */
    setQualityMode: (mode: QualityMode) => void;
    /** True after `auto` dropped to `low` because frames were slow. */
    autoLowered: boolean;
    /** Scene only: the automatic fallback fired. */
    _autoLower: () => void;
    resolution: Resolution;
    /** Saves the choice and applies it. */
    setResolution: (resolution: Resolution) => void;
    controlScheme: ControlScheme;
    /** Saves the choice and applies it. */
    setControlScheme: (scheme: ControlScheme) => void;
    pausedPose: PausedPose;
    /** Saves the choice and applies it. */
    setPausedPose: (pose: PausedPose) => void;
    /** True when WebGL draws in software: the scene stays on `low`. */
    softwareGl: boolean;
    /** Window only, before the scene mounts: what the WebGL probe found. */
    _setSoftwareGl: (softwareGl: boolean) => void;
    /** Rereads a choice saved elsewhere: a storage key, or null for all. */
    _loadPref: (key: string | null) => void;
    /** Scene only. */
    _setKit: (kitId: VenueKitId | null, kit: KitResult | null) => void;
    /** Scene only: the show's camera lists changed. */
    _setSavedCameras: (saved: ShowVenueCameras | undefined) => void;
    /** Scene only. */
    _setCrowd: (crowd: Crowd | null) => void;
    /** Scene only. */
    _setLighting: (lighting: LightingPreset | null) => void;
}

const ORIGIN: Vector3Tuple = [0, 0, 0];

const startMode = loadQualityMode();

/** The quality a mode starts at here: always `low` on software WebGL. */
function startQuality(mode: QualityMode, softwareGl: boolean): View3dQuality {
    return softwareGl ? "low" : initialQuality(mode);
}

/** The cameras for `kit` with the show's list for `kitId`, if it has one. */
function camerasFor(
    kitId: VenueKitId | null,
    kit: KitResult | null,
    saved: ShowVenueCameras | undefined,
): Pick<View3dSceneState, "cameras" | "camerasCustomized"> {
    const list = kitId ? saved?.[kitId]?.list : undefined;
    return {
        cameras: kit ? resolveCameras(kit.cameras, list) : [],
        camerasCustomized: list !== undefined,
    };
}

export const useView3dSceneStore = create<View3dSceneState>()((set, get) => ({
    kitId: null,
    kit: null,
    crowd: null,
    cameras: [],
    camerasCustomized: false,
    savedCameras: undefined,
    focus: ORIGIN,
    lighting: null,
    quality: initialQuality(startMode),
    setQuality: (quality) => set({ quality }),
    onBattery: false,
    _setOnBattery: (onBattery) => set({ onBattery }),
    qualityMode: startMode,
    setQualityMode: (mode) => {
        saveQualityMode(mode);
        set({
            qualityMode: mode,
            quality: startQuality(mode, get().softwareGl),
            autoLowered: false,
        });
    },
    autoLowered: false,
    _autoLower: () => set({ quality: "low", autoLowered: true }),
    resolution: loadResolution(),
    setResolution: (resolution) => {
        saveResolution(resolution);
        set({ resolution });
    },
    controlScheme: loadControlScheme(),
    setControlScheme: (controlScheme) => {
        saveControlScheme(controlScheme);
        set({ controlScheme });
    },
    pausedPose: loadPausedPose(),
    setPausedPose: (pausedPose) => {
        savePausedPose(pausedPose);
        set({ pausedPose });
    },
    softwareGl: false,
    _setSoftwareGl: (softwareGl) =>
        set({
            softwareGl,
            quality: startQuality(get().qualityMode, softwareGl),
            autoLowered: false,
        }),
    _loadPref: (key) => {
        if (key === null || key === QUALITY_STORAGE_KEY) {
            const mode = loadQualityMode();
            if (mode !== get().qualityMode)
                set({
                    qualityMode: mode,
                    quality: startQuality(mode, get().softwareGl),
                    autoLowered: false,
                });
        }
        if (key === null || key === RESOLUTION_STORAGE_KEY)
            set({ resolution: loadResolution() });
        if (key === null || key === CONTROL_SCHEME_STORAGE_KEY)
            set({ controlScheme: loadControlScheme() });
        if (key === null || key === PAUSED_POSE_STORAGE_KEY)
            set({ pausedPose: loadPausedPose() });
    },
    _setKit: (kitId, kit) =>
        set({
            kitId,
            kit,
            focus: kit ? kit.focus : ORIGIN,
            ...camerasFor(kitId, kit, get().savedCameras),
        }),
    _setSavedCameras: (savedCameras) => {
        const { kitId, kit, savedCameras: current } = get();
        if (JSON.stringify(savedCameras) === JSON.stringify(current)) return;
        set({ savedCameras, ...camerasFor(kitId, kit, savedCameras) });
    },
    _setCrowd: (crowd) => set({ crowd }),
    _setLighting: (lighting) => set({ lighting }),
}));

/**
 * Applies the quality, power, resolution and controls choices the Settings window
 * saves, as it saves them. Returns the function that stops listening.
 */
export function startPrefsSync(): () => void {
    const onStorage = (event: StorageEvent) =>
        useView3dSceneStore.getState()._loadPref(event.key);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}
