/**
 * The Director: while it is on, the 3D View's camera follows a track of
 * camera shots locked to show time, instead of the viewer (`CameraRig.tsx`
 * reads {@link directedPose} every drawn frame).
 *
 * The viewer always wins: choosing a camera, saving the view, or any drag,
 * scroll or pick turns the Director off, and the camera stays where it was.
 */
import { webChannel } from "@/utilities/webBuild";
import { create } from "zustand";
import {
    cameraAt,
    type CameraPose,
    type CinemaContext,
    type CinemaShot,
} from "@openmarch/core";
import { useCameraStore } from "../camera/cameraStore";

export interface DirectorState {
    /** Whether the Director has the camera. */
    directing: boolean;
    /** The shots it plays. Empty until the rig builds the demo track. */
    track: CinemaShot[];
    /** Turning it on leaves no camera selected and ends pick-a-seat. */
    setDirecting(on: boolean): void;
    setTrack(track: CinemaShot[]): void;
}

export const useDirectorStore = create<DirectorState>()((set, get) => ({
    directing: false,
    track: [],
    setDirecting: (on) => {
        if (get().directing === on) return;
        if (on) {
            const camera = useCameraStore.getState();
            if (camera.activeCameraId !== null) camera._setActive(null);
            if (camera.pickMode) camera.setPickMode(false);
        }
        set({ directing: on });
    },
    setTrack: (track) => set({ track }),
}));

// Choosing a camera (the menu, keys 1–9) or saving the view as one takes the
// camera back from the Director.
useCameraStore.subscribe((state, prev) => {
    if (!useDirectorStore.getState().directing) return;
    const chose = state._request !== null && state._request !== prev._request;
    const marked =
        state.activeCameraId !== null &&
        state.activeCameraId !== prev.activeCameraId;
    if (chose || marked) useDirectorStore.getState().setDirecting(false);
});

/** The setting that shows the Director outside dev builds: "1" is on. */
export const DIRECTOR_STORAGE_KEY = "view3d.director";

/**
 * Whether the Director is offered: in dev builds and lab test builds, or when the
 * {@link DIRECTOR_STORAGE_KEY} setting is "1". The flag goes away when the
 * camera track gets its editor.
 */
export function directorAvailable(): boolean {
    if (import.meta.env.DEV || webChannel === "lab") return true;
    try {
        return localStorage.getItem(DIRECTOR_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

/** Turns the Director on or off, where it is available. */
export function toggleDirector(): void {
    if (!directorAvailable()) return;
    const { directing, setDirecting } = useDirectorStore.getState();
    setDirecting(!directing);
}

/**
 * Where the Director puts the camera at show time `ms`, or null while it is
 * off or has no track. A time always gives the same pose, whether the show
 * plays or is scrubbed.
 */
export function directedPose(
    ms: number,
    ctx: CinemaContext,
): CameraPose | null {
    const { directing, track } = useDirectorStore.getState();
    if (!directing || track.length === 0) return null;
    return cameraAt(ms, track, ctx).pose;
}
