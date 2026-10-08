import { renderHook, act } from "@testing-library/react";
import {
    UiSettings,
    defaultSettings,
    useUiSettingsStore,
} from "../UiSettingsStore";
import { ElectronApi } from "electron/preload";
import { describe, expect, it, vi, beforeEach } from "vitest";

window.electron = {
    sendLockX: vi.fn(),
    sendLockY: vi.fn(),
} as Partial<ElectronApi> as ElectronApi;

const createLocalStorageMock = () => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
};

const localStorageMock = createLocalStorageMock();
Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock as unknown as Storage,
});

describe("uiSettings Store", () => {
    const initialSettings: UiSettings = {
        ...defaultSettings,
        previousPaths: true,
        nextPaths: true,
        gridLines: true,
        halfLines: true,
        timelinePixelsPerSecond: 16,
        focussedComponent: "canvas",
        mouseSettings: {
            ...defaultSettings.mouseSettings,
            zoomSensitivity: 4,
        },
    };

    beforeEach(() => {
        localStorageMock.clear();
        const { result } = renderHook(() => useUiSettingsStore());
        // Reset the settings to the initial state
        act(() => result.current.setUiSettings({ ...initialSettings }));
        vi.clearAllMocks();
    });

    it("uiSettingsStore - initial settings", async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useUiSettingsStore());
        expect(result.current.uiSettings).toEqual(initialSettings);
    });

    it("uiSettingsStore - set is playing", async () => {
        const { result } = renderHook(() => useUiSettingsStore());

        const expectedSettings = {
            ...initialSettings,
            isPlaying: true,
        };

        // Expect isPlaying to be true
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect isPlaying to be false
        expectedSettings.isPlaying = false;
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);
    });

    // TODO: Re-enable this test when collisions are re-enabled
    it.todo("uiSettingsStore - set showCollisions", async () => {
        const { result } = renderHook(() => useUiSettingsStore());

        const expectedSettings = {
            ...initialSettings,
            showCollisions: false,
        };

        // Expect showCollisions to be false
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect showCollisions to be true
        expectedSettings.showCollisions = true;
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);
    });

    it("uiSettingsStore - set lockX and lockY", async () => {
        const { result } = renderHook(() => useUiSettingsStore());

        const expectedSettings = {
            ...initialSettings,
            lockX: true,
            lockY: false,
        };

        // Expect lockX to be true and lockY to be false
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect lockY to be true and lockX to be false
        expectedSettings.lockX = false;
        expectedSettings.lockY = true;
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect both to be false
        expectedSettings.lockX = false;
        expectedSettings.lockY = false;
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect both to be true
        expectedSettings.lockX = true;
        expectedSettings.lockY = true;
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);
    });

    it('uiSettingsStore - expect that lockX and lockY cannot both be true when "type" is passed', async () => {
        const { result } = renderHook(() => useUiSettingsStore());

        const expectedSettings = {
            ...initialSettings,
            lockX: true,
            lockY: false,
        };

        // Set lockX to true and lockY to false initially
        act(() => result.current.setUiSettings({ ...expectedSettings }));

        // Expect that changing lockY to true will also change lockX to false
        expectedSettings.lockY = true;
        act(() =>
            result.current.setUiSettings({ ...expectedSettings }, "lockY"),
        );
        expectedSettings.lockX = false;
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect that changing lockX to true will also change lockY to false
        expectedSettings.lockX = true;
        act(() =>
            result.current.setUiSettings({ ...expectedSettings }, "lockX"),
        );
        expectedSettings.lockY = false;
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect that lockY will be false
        expectedSettings.lockX = true;
        expectedSettings.lockY = true;
        act(() =>
            result.current.setUiSettings({ ...expectedSettings }, "lockX"),
        );
        expectedSettings.lockY = false;
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect that lockX will be false
        expectedSettings.lockX = true;
        expectedSettings.lockY = true;
        act(() =>
            result.current.setUiSettings({ ...expectedSettings }, "lockY"),
        );
        expectedSettings.lockX = false;
        expect(result.current.uiSettings).toEqual(expectedSettings);
    });

    it("keeps the settings object and skips the save when a timeline setter gets the same value", () => {
        const store = useUiSettingsStore.getState();
        const before = store.uiSettings;

        store.setTimelinePixelsPerBeat(before.timelinePixelsPerBeat);
        store.setTimelineZoomFitted(before.timelineZoomFitted);
        store.setPixelsPerSecond(before.timelinePixelsPerSecond);
        store.setTimelineCompact(before.timelineCompact);

        expect(useUiSettingsStore.getState().uiSettings).toBe(before);
        expect(localStorageMock.setItem).not.toHaveBeenCalled();

        store.setTimelinePixelsPerBeat(before.timelinePixelsPerBeat + 4);
        expect(
            useUiSettingsStore.getState().uiSettings.timelinePixelsPerBeat,
        ).toBe(before.timelinePixelsPerBeat + 4);
        expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    });

    it("does not re-render a component reading one field when the timeline zoom is saved", () => {
        let renders = 0;
        renderHook(() => {
            renders++;
            return useUiSettingsStore((s) => s.uiSettings.focussedComponent);
        });
        expect(renders).toBe(1);

        act(() => {
            const store = useUiSettingsStore.getState();
            store.setTimelinePixelsPerBeat(
                store.uiSettings.timelinePixelsPerBeat + 2,
            );
            store.setTimelineZoomFitted(!store.uiSettings.timelineZoomFitted);
        });
        expect(renders).toBe(1);

        act(() =>
            useUiSettingsStore.getState().setUiSettings({
                ...useUiSettingsStore.getState().uiSettings,
                focussedComponent: "timeline",
            }),
        );
        expect(renders).toBe(2);
    });
});
