import { describe, expect, it } from "vitest";
import {
    MIN_CANVAS_HEIGHT,
    MIN_TIMELINE_HEIGHT,
    TIMELINE_SPLIT_GUTTER,
    clampTimelineHeight,
    maxTimelineHeight,
    parseTimelineHeight,
} from "../timelineSplit";
import {
    UI_SETTINGS_STORAGE_KEY,
    defaultSettings,
    useUiSettingsStore,
} from "@/stores/UiSettingsStore";

describe("clampTimelineHeight", () => {
    it("keeps a height in range", () => {
        expect(clampTimelineHeight(300, 1000)).toBe(300);
    });
    it("holds the timeline minimum", () => {
        expect(clampTimelineHeight(10, 1000)).toBe(MIN_TIMELINE_HEIGHT);
    });
    it("leaves the canvas its minimum", () => {
        expect(clampTimelineHeight(5000, 1000)).toBe(
            1000 - MIN_CANVAS_HEIGHT - TIMELINE_SPLIT_GUTTER,
        );
        expect(maxTimelineHeight(1000)).toBe(784);
    });
    it("lets the timeline minimum win in a short window", () => {
        expect(clampTimelineHeight(400, 250)).toBe(MIN_TIMELINE_HEIGHT);
    });
    it("does not clamp when the workspace is not measured yet", () => {
        expect(clampTimelineHeight(5000, Infinity)).toBe(5000);
    });
});

describe("timeline height persistence", () => {
    it("fits the tracks by default", () => {
        expect(defaultSettings.timelineHeight).toBeNull();
    });
    it("treats unusable saved values as fitted", () => {
        expect(parseTimelineHeight("tall")).toBeNull();
        expect(parseTimelineHeight(-4)).toBeNull();
        expect(parseTimelineHeight(undefined)).toBeNull();
        expect(parseTimelineHeight(321)).toBe(321);
    });
    it("saves a height and a reset to the settings in storage", () => {
        const stored = () =>
            (
                JSON.parse(
                    localStorage.getItem(UI_SETTINGS_STORAGE_KEY) ?? "{}",
                ) as { timelineHeight?: number | null }
            ).timelineHeight;
        useUiSettingsStore.getState().setTimelineHeight(333);
        expect(useUiSettingsStore.getState().uiSettings.timelineHeight).toBe(
            333,
        );
        expect(stored()).toBe(333);
        useUiSettingsStore.getState().setTimelineHeight(null);
        expect(stored()).toBeNull();
    });
});
