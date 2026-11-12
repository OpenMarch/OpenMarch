/**
 * How the 3D View poses the marchers while the show is paused. `closed`, the
 * default, stands everyone at attention on their dot, feet together, as a
 * paused editor shows a set. `step` shows the actual moment: mid-stride
 * when the show is paused mid-move, as playback would draw that frame.
 * Playing always shows the actual motion.
 *
 * A viewing choice for this computer, like the render preferences
 * (`renderPrefs.ts`), so it lives in local storage.
 */

export type PausedPose = "closed" | "step";

export const PAUSED_POSE_STORAGE_KEY = "view3d.pausedPose";

export function parsePausedPose(value: unknown): PausedPose {
    return value === "step" ? "step" : "closed";
}

/** The saved choice, or `closed` when there is none or storage is unavailable. */
export function loadPausedPose(storage?: Storage): PausedPose {
    try {
        return parsePausedPose(
            (storage ?? window.localStorage).getItem(PAUSED_POSE_STORAGE_KEY),
        );
    } catch {
        return "closed";
    }
}

export function savePausedPose(pose: PausedPose, storage?: Storage) {
    try {
        (storage ?? window.localStorage).setItem(PAUSED_POSE_STORAGE_KEY, pose);
    } catch {
        // Private or blocked storage: the choice lasts for this session only.
    }
}
