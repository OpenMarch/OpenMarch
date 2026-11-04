import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../i18n/en.json";
import ShortcutDispatcher from "../ShortcutDispatcher";
import { getActionPaletteItems } from "../palette/actionSource";
import { useUiActionHandlers } from "../handlers/useUiActionHandlers";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    startFlagLevelsInEffect,
    useStartFlagKeyStore,
} from "@/stores/StartFlagKeyStore";
import type { StartFlagPositionsSettings } from "@/timeline/startFlagLevels";

/** Distinct states, so the levels in effect say which one the field shows */
const SETTINGS: StartFlagPositionsSettings = {
    always: { dots: "selected", paths: "off" },
    hold: { dots: "all", paths: "all" },
};

/** The levels the field draws right now */
const inEffect = () =>
    startFlagLevelsInEffect(
        useUiSettingsStore.getState().uiSettings.startFlagPositions,
        useStartFlagKeyStore.getState(),
    );

/** Looks a key up in en.json, as the app's `t` does in English (the key itself when missing). */
const t = (key: string): string => {
    const value = key
        .split(".")
        .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)?.[part],
            en,
        );
    return typeof value === "string" ? value : key;
};

/** Runs "Toggle start flag positions" from the command palette */
const runFromPalette = () => {
    const item = getActionPaletteItems({ t }, {}).find(
        (i) => i.id === "action:toggleStartFlagPositions",
    );
    expect(item?.label).toBe("Toggle start flag positions");
    act(() => item!.run());
};

const pressN = () => fireEvent.keyDown(window, { key: "n", code: "KeyN" });
const releaseN = () => fireEvent.keyUp(window, { key: "n", code: "KeyN" });
const wait = (ms: number) =>
    act(() => {
        vi.advanceTimersByTime(ms);
    });

beforeEach(() => {
    vi.useFakeTimers();
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    setUiSettings({
        ...uiSettings,
        startFlagPositions: SETTINGS,
    });
    useStartFlagKeyStore.setState({
        held: false,
        latched: false,
        pressedAt: null,
    });
    renderHook(() => useUiActionHandlers());
    render(<ShortcutDispatcher />);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("the N key for start flag positions", () => {
    it("shows the Hold N state while held, and Always again once let go", () => {
        expect(inEffect()).toEqual(SETTINGS.always);
        pressN();
        expect(inEffect()).toEqual(SETTINGS.hold);
        wait(400);
        // Key repeats while held change nothing
        fireEvent.keyDown(window, { key: "n", code: "KeyN", repeat: true });
        expect(inEffect()).toEqual(SETTINGS.hold);
        releaseN();
        expect(inEffect()).toEqual(SETTINGS.always);
    });

    it("latches the Hold N state on a quick tap, until the next tap", () => {
        pressN();
        wait(100);
        releaseN();
        expect(inEffect()).toEqual(SETTINGS.hold);
        // Still latched long after
        wait(5000);
        expect(inEffect()).toEqual(SETTINGS.hold);
        pressN();
        wait(100);
        releaseN();
        expect(inEffect()).toEqual(SETTINGS.always);
    });

    it("lets go of a held N when the window loses focus, without latching", () => {
        pressN();
        wait(50);
        fireEvent.blur(window);
        expect(inEffect()).toEqual(SETTINGS.always);
        // The key coming up later changes nothing
        releaseN();
        expect(inEffect()).toEqual(SETTINGS.always);
    });

    it("keeps a latch when the window loses focus", () => {
        pressN();
        releaseN();
        fireEvent.blur(window);
        expect(inEffect()).toEqual(SETTINGS.hold);
    });

    it("counts a release at 250 ms as a hold, not a tap", () => {
        pressN();
        wait(250);
        releaseN();
        expect(inEffect()).toEqual(SETTINGS.always);
    });

    it("latches the Hold N state from the command palette, until it runs again", () => {
        runFromPalette();
        expect(inEffect()).toEqual(SETTINGS.hold);
        wait(5000);
        expect(inEffect()).toEqual(SETTINGS.hold);
        runFromPalette();
        expect(inEffect()).toEqual(SETTINGS.always);
    });

    it("lets a tap of N undo a latch from the palette", () => {
        runFromPalette();
        pressN();
        releaseN();
        expect(inEffect()).toEqual(SETTINGS.always);
    });
});
