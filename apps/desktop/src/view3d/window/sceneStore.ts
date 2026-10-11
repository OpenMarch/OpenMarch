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
 * - `quality`: the render quality the scene builds for. `low` drops
 *   shadows and halves the crowd.
 * - `hornState`: which hold the brass plays. Always `up` for shows; the
 *   settings panel can switch it to check the other holds (`hornState.ts`).
 * - `guardEquipment`: what the guard sections carry: `section` for each
 *   section's own (flags carry the 6 ft flag, rifles the rifle), or one
 *   piece for every guard section, to see the other equipment. A window
 *   setting until sections store their equipment.
 * - `stepOffFoot`: which foot the band steps off on; `right` plays every
 *   clip mirrored. A window setting until the show stores it.
 * - `powerPrefs`: pause drawing when nothing moves, and cap the frame rate
 *   on battery (`drawPolicy.ts`); saved per computer. Set it with
 *   `setPowerPrefs`. `onBattery` is the window's own reading of the battery.
 * - `qualityMode`: the viewer's choice in the settings panel (`auto`, `low`
 *   or `high`), saved per computer. Set it with `setQualityMode`. In `auto`
 *   the scene lowers `quality` once with `_autoLower()` when frames are slow
 *   (P5.1), and `autoLowered` says so.
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
import {
    initialQuality,
    loadQualityMode,
    saveQualityMode,
    type QualityMode,
} from "./qualityPreference";
import type { HoldState } from "./hornState";
import type { GuardModelId } from "@/view3d/core/instruments/model";
import { loadPowerPrefs, savePowerPrefs, type PowerPrefs } from "./drawPolicy";
import type { StepOffFoot } from "./performers/marchers/marcherBodies";

/** People within this many meters of a seat camera are hidden (ui.md UI-3). */
export const CROWD_CLEAR_RADIUS = 4.9;

export type View3dQuality = "low" | "high";

/** Each guard section's own equipment, or one piece for all of them. */
export type GuardEquipment = "section" | GuardModelId;

export interface View3dSceneState {
    kitId: VenueKitId | null;
    kit: KitResult | null;
    crowd: Crowd | null;
    focus: Vector3Tuple;
    lighting: LightingPreset | null;
    quality: View3dQuality;
    setQuality: (quality: View3dQuality) => void;
    hornState: HoldState;
    setHornState: (state: HoldState) => void;
    guardEquipment: GuardEquipment;
    setGuardEquipment: (equipment: GuardEquipment) => void;
    stepOffFoot: StepOffFoot;
    setStepOffFoot: (foot: StepOffFoot) => void;
    powerPrefs: PowerPrefs;
    setPowerPrefs: (prefs: PowerPrefs) => void;
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
    /** Scene only. */
    _setKit: (kitId: VenueKitId | null, kit: KitResult | null) => void;
    /** Scene only. */
    _setCrowd: (crowd: Crowd | null) => void;
    /** Scene only. */
    _setLighting: (lighting: LightingPreset | null) => void;
}

const ORIGIN: Vector3Tuple = [0, 0, 0];

const startMode = loadQualityMode();

export const useView3dSceneStore = create<View3dSceneState>()((set) => ({
    kitId: null,
    kit: null,
    crowd: null,
    focus: ORIGIN,
    lighting: null,
    quality: initialQuality(startMode),
    setQuality: (quality) => set({ quality }),
    hornState: "up",
    setHornState: (hornState) => set({ hornState }),
    guardEquipment: "section",
    setGuardEquipment: (guardEquipment) => set({ guardEquipment }),
    stepOffFoot: "left",
    setStepOffFoot: (stepOffFoot) => set({ stepOffFoot }),
    powerPrefs: loadPowerPrefs(),
    setPowerPrefs: (powerPrefs) => {
        savePowerPrefs(powerPrefs);
        set({ powerPrefs });
    },
    onBattery: false,
    _setOnBattery: (onBattery) => set({ onBattery }),
    qualityMode: startMode,
    setQualityMode: (mode) => {
        saveQualityMode(mode);
        set({
            qualityMode: mode,
            quality: initialQuality(mode),
            autoLowered: false,
        });
    },
    autoLowered: false,
    _autoLower: () => set({ quality: "low", autoLowered: true }),
    _setKit: (kitId, kit) =>
        set({ kitId, kit, focus: kit ? kit.focus : ORIGIN }),
    _setCrowd: (crowd) => set({ crowd }),
    _setLighting: (lighting) => set({ lighting }),
}));
