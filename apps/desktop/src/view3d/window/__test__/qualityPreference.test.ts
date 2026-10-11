import { describe, expect, it } from "vitest";
import {
    QUALITY_STORAGE_KEY,
    initialQuality,
    loadQualityMode,
    parseQualityMode,
    saveQualityMode,
} from "../qualityPreference";

function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
        get length() {
            return data.size;
        },
        clear: () => data.clear(),
        getItem: (key) => data.get(key) ?? null,
        key: (index) => [...data.keys()][index] ?? null,
        removeItem: (key) => void data.delete(key),
        setItem: (key, value) => void data.set(key, String(value)),
    };
}

describe("quality preference", () => {
    it("defaults to auto for missing or unknown values", () => {
        expect(parseQualityMode(null)).toBe("auto");
        expect(parseQualityMode("ultra")).toBe("auto");
        expect(loadQualityMode(memoryStorage())).toBe("auto");
    });

    it("round-trips a saved choice", () => {
        const storage = memoryStorage();
        saveQualityMode("low", storage);
        expect(storage.getItem(QUALITY_STORAGE_KEY)).toBe("low");
        expect(loadQualityMode(storage)).toBe("low");
    });

    it("falls back to auto when storage throws", () => {
        const broken = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("blocked");
            },
        } as unknown as Storage;
        expect(loadQualityMode(broken)).toBe("auto");
        expect(() => saveQualityMode("high", broken)).not.toThrow();
    });

    it("starts auto and high on high quality, low on low", () => {
        expect(initialQuality("auto")).toBe("high");
        expect(initialQuality("high")).toBe("high");
        expect(initialQuality("low")).toBe("low");
    });
});
