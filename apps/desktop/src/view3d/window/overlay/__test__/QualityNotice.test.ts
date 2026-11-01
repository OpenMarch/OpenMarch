// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    QUALITY_NOTICE_STORAGE_KEY,
    markSoftwareExplained,
} from "../QualityNotice";

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

describe("markSoftwareExplained", () => {
    it("explains software drawing once per computer", () => {
        const storage = memoryStorage();
        expect(markSoftwareExplained(storage)).toBe(true);
        expect(storage.getItem(QUALITY_NOTICE_STORAGE_KEY)).toBe("true");
        expect(markSoftwareExplained(storage)).toBe(false);
    });

    it("explains again when storage is blocked", () => {
        const broken = {
            getItem: () => {
                throw new Error("blocked");
            },
        } as unknown as Storage;
        expect(markSoftwareExplained(broken)).toBe(true);
        expect(markSoftwareExplained(broken)).toBe(true);
    });
});
