import { describe, expect, it } from "vitest";
import { SETTINGS_TAB_STORAGE_KEY, loadSettingsTab } from "../SettingsPanel";

function storageWith(value: string | null, broken = false): Storage {
    return {
        length: 0,
        clear: () => {},
        key: () => null,
        removeItem: () => {},
        setItem: () => {},
        getItem: (key: string) => {
            if (broken) throw new Error("blocked");
            return key === SETTINGS_TAB_STORAGE_KEY ? value : null;
        },
    };
}

describe("loadSettingsTab", () => {
    it("opens on the tab used last", () => {
        expect(loadSettingsTab(storageWith("preferences"))).toBe("preferences");
        expect(loadSettingsTab(storageWith("performers"))).toBe("performers");
    });

    it("opens on Venue with nothing saved, a stale value or blocked storage", () => {
        expect(loadSettingsTab(storageWith(null))).toBe("venue");
        expect(loadSettingsTab(storageWith("graphics"))).toBe("venue");
        expect(loadSettingsTab(storageWith(null, true))).toBe("venue");
    });
});
