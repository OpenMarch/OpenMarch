/**
 * Following a performer in the 3D View: the contract between the overlay
 * (`overlay/CameraBar.tsx`) and the camera rig (`CameraRig.tsx`).
 *
 * - `picking` and `setPicking(on)`: pick-a-performer. While on, the canvas
 *   shows a crosshair and the next click on a performer follows them; the
 *   rig turns it off after one pick or on Esc. Turning it on ends
 *   pick-a-seat, and pick-a-seat turning on ends this.
 * - `follow`: who the camera follows and how, or null for none.
 *   `"third"` keeps the camera behind them as they move (orbit and zoom
 *   still work around them); `"pov"` looks out of their eyes (drag looks
 *   around, scroll zooms).
 * - `followMarcher(id, mode)`, `setMode(mode)`, `toggleMode()` and `stop()`
 *   change it. `setFraming` changes the aim and field of view of the follow
 *   now (a follow camera's settings), and `currentFraming()` reads back
 *   where the viewer has orbited or looked to. `backOut()` is Esc: the point of view goes back to the
 *   third-person view, the third-person view stops following.
 *
 * The rig ends following on its own when the viewer pans, double-clicks,
 * picks a seat, chooses a camera, turns on the Director or changes venue, and
 * when the performer is gone from the show.
 *
 * Two viewing choices, saved on this computer (like the paused pose):
 *
 * - `turnWithPerformer` (default on): the third-person camera swings round
 *   behind the performer as they turn, as a game's camera does, keeping any
 *   angle the viewer orbited to. Off, it keeps its compass direction.
 * - `showOwnBody` (default on): the point of view draws the performer's own
 *   arms and instrument in front of the eyes. Off, their body is left out.
 *
 * `hiddenMarcherId` (rig only) is the performer whose body the scene leaves
 * out, so the point of view doesn't look out through their head.
 * `headlessMarcherId` (rig only) is the performer drawn without their head,
 * hat and plume, while the camera is in their eyes with their body shown.
 */
import { create } from "zustand";

export type FollowMode = "third" | "pov";

/**
 * Where a follow camera aims, each the mode's own default when omitted
 * (`cameraList.ts` `cameraFollowSchema` says what each means per mode).
 */
export interface FollowFraming {
    angleDeg?: number;
    tiltDeg?: number;
    distanceM?: number;
}

export interface Follow {
    marcherId: number;
    mode: FollowMode;
    /** Field of view to start with (a saved follow camera's); the mode's own when omitted. */
    fovDeg?: number;
    /** Where to aim (a saved follow camera's); the mode's own when omitted. */
    framing?: FollowFraming;
}

export const TURN_WITH_PERFORMER_STORAGE_KEY = "view3d.followTurns";
export const SHOW_OWN_BODY_STORAGE_KEY = "view3d.povShowsBody";

/** A saved on/off choice, `fallback` when there is none or storage is unavailable. */
export function loadFlag(key: string, fallback: boolean, storage?: Storage) {
    try {
        const value = (storage ?? window.localStorage).getItem(key);
        return value === null ? fallback : value === "1";
    } catch {
        return fallback;
    }
}

function saveFlag(key: string, on: boolean) {
    try {
        window.localStorage.setItem(key, on ? "1" : "0");
    } catch {
        // Private or blocked storage: the choice lasts for this session only.
    }
}

export interface FollowState {
    picking: boolean;
    setPicking: (on: boolean) => void;
    follow: Follow | null;
    followMarcher: (
        marcherId: number,
        mode?: FollowMode,
        fovDeg?: number,
        framing?: FollowFraming,
    ) => void;
    /** Changes the field of view and aim of the follow now, if any. */
    setFraming: (fovDeg: number | undefined, framing: FollowFraming) => void;
    /** Where the follow aims now, with the viewer's orbit or look; null when not following. */
    currentFraming: () => FollowFraming | null;
    /** Rig only: what `currentFraming` reads. */
    _setFramingSource: (source: (() => FollowFraming | null) | null) => void;
    setMode: (mode: FollowMode) => void;
    toggleMode: () => void;
    stop: () => void;
    /** Esc: the point of view backs out to the third-person view, which stops. True when it did something. */
    backOut: () => boolean;
    turnWithPerformer: boolean;
    setTurnWithPerformer: (on: boolean) => void;
    showOwnBody: boolean;
    setShowOwnBody: (on: boolean) => void;
    hiddenMarcherId: number | null;
    /** Rig only. */
    _setHidden: (marcherId: number | null) => void;
    headlessMarcherId: number | null;
    /** Rig only. */
    _setHeadless: (marcherId: number | null) => void;
}

/** A saved follow's aim, as the follow store takes it; none when it has none. */
export function framingOf(follow: FollowFraming): FollowFraming | undefined {
    const { angleDeg, tiltDeg, distanceM } = follow;
    if (
        angleDeg === undefined &&
        tiltDeg === undefined &&
        distanceM === undefined
    )
        return undefined;
    return {
        ...(angleDeg === undefined ? {} : { angleDeg }),
        ...(tiltDeg === undefined ? {} : { tiltDeg }),
        ...(distanceM === undefined ? {} : { distanceM }),
    };
}

/** Registered by the rig; outside the state so setting it draws nothing. */
let framingSource: (() => FollowFraming | null) | null = null;

export const useFollowStore = create<FollowState>()((set, get) => ({
    picking: false,
    setPicking: (on) => set({ picking: on }),
    follow: null,
    followMarcher: (marcherId, mode = "third", fovDeg, framing) =>
        set({
            follow: {
                marcherId,
                mode,
                ...(fovDeg === undefined ? {} : { fovDeg }),
                ...(framing ? { framing } : {}),
            },
            picking: false,
        }),
    setFraming: (fovDeg, framing) => {
        const { follow } = get();
        if (!follow) return;
        set({
            follow: {
                marcherId: follow.marcherId,
                mode: follow.mode,
                ...(fovDeg === undefined ? {} : { fovDeg }),
                framing,
            },
        });
    },
    currentFraming: () => framingSource?.() ?? null,
    _setFramingSource: (source) => {
        framingSource = source;
    },
    setMode: (mode) => {
        const { follow } = get();
        if (!follow || follow.mode === mode) return;
        set({ follow: { marcherId: follow.marcherId, mode } });
    },
    toggleMode: () => {
        const { follow } = get();
        if (!follow) return;
        get().setMode(follow.mode === "pov" ? "third" : "pov");
    },
    stop: () => {
        if (get().follow) set({ follow: null });
    },
    backOut: () => {
        const { follow } = get();
        if (!follow) return false;
        if (follow.mode === "pov") get().setMode("third");
        else get().stop();
        return true;
    },
    turnWithPerformer: loadFlag(TURN_WITH_PERFORMER_STORAGE_KEY, true),
    setTurnWithPerformer: (on) => {
        saveFlag(TURN_WITH_PERFORMER_STORAGE_KEY, on);
        set({ turnWithPerformer: on });
    },
    showOwnBody: loadFlag(SHOW_OWN_BODY_STORAGE_KEY, true),
    setShowOwnBody: (on) => {
        saveFlag(SHOW_OWN_BODY_STORAGE_KEY, on);
        set({ showOwnBody: on });
    },
    hiddenMarcherId: null,
    _setHidden: (marcherId) => {
        if (get().hiddenMarcherId !== marcherId)
            set({ hiddenMarcherId: marcherId });
    },
    headlessMarcherId: null,
    _setHeadless: (marcherId) => {
        if (get().headlessMarcherId !== marcherId)
            set({ headlessMarcherId: marcherId });
    },
}));

/** The key that turns picking a performer to follow on and off. */
export const FOLLOW_KEY = "P";
/** The key that switches between the third-person view and the point of view. */
export const POV_KEY = "V";
