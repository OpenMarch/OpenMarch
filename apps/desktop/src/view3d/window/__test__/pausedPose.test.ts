import { describe, expect, it } from "vitest";
import {
    PAUSED_POSE_STORAGE_KEY,
    loadPausedPose,
    parsePausedPose,
    savePausedPose,
} from "../pausedPose";

function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
    } as Storage;
}

describe("paused pose preference", () => {
    it("defaults to the closed position", () => {
        expect(parsePausedPose(null)).toBe("closed");
        expect(parsePausedPose("anything")).toBe("closed");
        expect(loadPausedPose(memoryStorage())).toBe("closed");
    });

    it("keeps the actual step once chosen", () => {
        const storage = memoryStorage();
        savePausedPose("step", storage);
        expect(storage.getItem(PAUSED_POSE_STORAGE_KEY)).toBe("step");
        expect(loadPausedPose(storage)).toBe("step");
    });

    it("falls back to closed when storage throws", () => {
        const broken = {
            getItem: () => {
                throw new Error("blocked");
            },
        } as unknown as Storage;
        expect(loadPausedPose(broken)).toBe("closed");
    });
});
