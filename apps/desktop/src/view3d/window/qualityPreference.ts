/**
 * The viewer's render quality choice. It describes this computer's graphics,
 * not the show, so it lives in the window's local storage (ADR 0002 D-5),
 * never in the show file.
 *
 * - `auto`: start on `high`, and drop to `low` once if frames are slow
 *   (`qualityFallback.ts`).
 * - `high` or `low`: fixed; the automatic fallback is off.
 */
import type { View3dQuality } from "./sceneStore";

export type QualityMode = "auto" | View3dQuality;

export const QUALITY_MODES: readonly QualityMode[] = ["auto", "low", "high"];

export const QUALITY_STORAGE_KEY = "view3d.quality";

export function parseQualityMode(value: unknown): QualityMode {
    return QUALITY_MODES.includes(value as QualityMode)
        ? (value as QualityMode)
        : "auto";
}

/** The saved choice, or `auto` when there is none or storage is unavailable. */
export function loadQualityMode(storage?: Storage): QualityMode {
    try {
        return parseQualityMode(
            (storage ?? window.localStorage).getItem(QUALITY_STORAGE_KEY),
        );
    } catch {
        return "auto";
    }
}

export function saveQualityMode(mode: QualityMode, storage?: Storage) {
    try {
        (storage ?? window.localStorage).setItem(QUALITY_STORAGE_KEY, mode);
    } catch {
        // Private or blocked storage: the choice lasts for this session only.
    }
}

/** The quality a mode starts at. */
export function initialQuality(mode: QualityMode): View3dQuality {
    return mode === "low" ? "low" : "high";
}
