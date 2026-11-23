import { describe, expect, it } from "vitest";
import {
    displayContaining,
    listDisplays,
    parseSavedWindowState,
    resolvePlacement,
    type WindowDefaults,
} from "../window-placement";

// A laptop on the left (main) and a monitor to its right
const laptop = { id: 1, workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const monitor = {
    id: 2,
    workArea: { x: 1440, y: 0, width: 2560, height: 1400 },
};
const displays = [laptop, monitor];

const editorDefaults: WindowDefaults = {
    maximized: true,
    size: (workArea) => ({
        width: Math.round(workArea.width * 0.8),
        height: Math.round(workArea.height * 0.8),
    }),
    min: { width: 768, height: 600 },
};
const view3dDefaults: WindowDefaults = {
    maximized: false,
    size: () => ({ width: 1280, height: 800 }),
    min: { width: 640, height: 400 },
};

const onMonitor = {
    bounds: { x: 1600, y: 100, width: 1600, height: 1000 },
    maximized: false,
    fullScreen: false,
    displayId: 2,
};

describe("resolvePlacement", () => {
    it("opens the editor maximized on the main display the first time", () => {
        const placement = resolvePlacement({
            saved: undefined,
            openOn: undefined,
            displays,
            primary: laptop,
            defaults: editorDefaults,
        });
        expect(placement.maximized).toBe(true);
        expect(placement.fullScreen).toBe(false);
        // Centered on the laptop, so un-maximizing leaves it there
        expect(displayContaining(placement.bounds, displays)?.id).toBe(1);
        expect(placement.bounds).toEqual({
            x: 144,
            y: 113,
            width: 1152,
            height: 700,
        });
    });

    it("opens the 3D View at its default size on a chosen display the first time", () => {
        expect(
            resolvePlacement({
                saved: undefined,
                openOn: "2",
                displays,
                primary: laptop,
                defaults: view3dDefaults,
            }),
        ).toEqual({
            bounds: { x: 2080, y: 300, width: 1280, height: 800 },
            maximized: false,
            fullScreen: false,
        });
    });

    it("comes back exactly where it was left", () => {
        expect(
            resolvePlacement({
                saved: { ...onMonitor, maximized: true },
                openOn: "last",
                displays,
                primary: laptop,
                defaults: editorDefaults,
            }),
        ).toEqual({
            bounds: onMonitor.bounds,
            maximized: true,
            fullScreen: false,
        });
    });

    it("comes back full screen if it was", () => {
        const placement = resolvePlacement({
            saved: { ...onMonitor, fullScreen: true },
            openOn: "last",
            displays,
            primary: laptop,
            defaults: view3dDefaults,
        });
        expect(placement.fullScreen).toBe(true);
        expect(placement.bounds).toEqual(onMonitor.bounds);
    });

    it("moves to a chosen display, keeping its size and centering it there", () => {
        const placement = resolvePlacement({
            saved: {
                bounds: { x: 100, y: 100, width: 1000, height: 700 },
                maximized: false,
                fullScreen: false,
                displayId: 1,
            },
            openOn: "2",
            displays,
            primary: laptop,
            defaults: view3dDefaults,
        });
        expect(placement.bounds).toEqual({
            x: 2220,
            y: 350,
            width: 1000,
            height: 700,
        });
    });

    it("shrinks a window too big for the chosen display to fit it", () => {
        const placement = resolvePlacement({
            saved: onMonitor,
            openOn: "1",
            displays,
            primary: laptop,
            defaults: editorDefaults,
        });
        expect(placement.bounds).toEqual({
            x: 0,
            y: 25,
            width: 1440,
            height: 875,
        });
    });

    it("stays maximized when moved to a chosen display", () => {
        const placement = resolvePlacement({
            saved: { ...onMonitor, maximized: true },
            openOn: "1",
            displays,
            primary: laptop,
            defaults: editorDefaults,
        });
        expect(placement.maximized).toBe(true);
        expect(displayContaining(placement.bounds, displays)?.id).toBe(1);
    });

    it("opens where it was left while the chosen display isn't connected", () => {
        expect(
            resolvePlacement({
                saved: onMonitor,
                openOn: "99",
                displays,
                primary: laptop,
                defaults: editorDefaults,
            }).bounds,
        ).toEqual(onMonitor.bounds);
    });

    it("opens on the main display when the one it was left on is gone", () => {
        const placement = resolvePlacement({
            saved: onMonitor,
            openOn: "last",
            displays: [laptop],
            primary: laptop,
            defaults: editorDefaults,
        });
        expect(displayContaining(placement.bounds, [laptop])?.id).toBe(1);
        expect(placement.bounds.width).toBe(1440);
    });

    it("trusts the saved display over normal bounds left on another one", () => {
        // Maximized on the monitor, but its un-maximized bounds still on the laptop
        const placement = resolvePlacement({
            saved: {
                bounds: { x: 100, y: 100, width: 1000, height: 700 },
                maximized: true,
                fullScreen: false,
                displayId: 2,
            },
            openOn: "last",
            displays,
            primary: laptop,
            defaults: editorDefaults,
        });
        expect(placement.maximized).toBe(true);
        expect(displayContaining(placement.bounds, displays)?.id).toBe(2);
    });

    it("never opens smaller than the minimum size", () => {
        const placement = resolvePlacement({
            saved: {
                bounds: { x: 100, y: 100, width: 300, height: 200 },
                maximized: false,
                fullScreen: false,
                displayId: 1,
            },
            openOn: "last",
            displays,
            primary: laptop,
            defaults: editorDefaults,
        });
        expect(placement.bounds).toMatchObject({ width: 768, height: 600 });
    });
});

describe("parseSavedWindowState", () => {
    it("reads a saved state", () => {
        expect(parseSavedWindowState(onMonitor)).toEqual(onMonitor);
    });

    it.each([
        undefined,
        null,
        "bounds",
        {},
        { bounds: { x: 0, y: 0, width: 0, height: 10 } },
        { bounds: { x: "0", y: 0, width: 10, height: 10 } },
    ])("ignores a malformed state: %j", (value) => {
        expect(parseSavedWindowState(value)).toBeUndefined();
    });
});

describe("listDisplays", () => {
    it("numbers displays left to right, in pixels, marking the main one", () => {
        expect(
            listDisplays(
                [
                    {
                        id: 7,
                        label: "DELL U2720Q",
                        bounds: { x: 1440, y: 0, width: 2560, height: 1440 },
                        scaleFactor: 1,
                    },
                    {
                        id: 3,
                        label: "",
                        bounds: { x: 0, y: 0, width: 1440, height: 900 },
                        scaleFactor: 2,
                    },
                ],
                3,
            ),
        ).toEqual([
            {
                id: 3,
                label: "",
                width: 2880,
                height: 1800,
                primary: true,
                number: 1,
            },
            {
                id: 7,
                label: "DELL U2720Q",
                width: 2560,
                height: 1440,
                primary: false,
                number: 2,
            },
        ]);
    });
});

describe("resolvePlacement keeps a restored window usable", () => {
    it("shrinks it to a display whose resolution dropped", () => {
        const smaller = {
            id: 2,
            workArea: { x: 1440, y: 0, width: 1280, height: 720 },
        };
        const placement = resolvePlacement({
            saved: onMonitor,
            openOn: "last",
            displays: [laptop, smaller],
            primary: laptop,
            defaults: view3dDefaults,
        });
        expect(placement.bounds).toEqual({
            x: 1440,
            y: 0,
            width: 1280,
            height: 720,
        });
    });

    it("brings a title bar above the screen back onto it", () => {
        const placement = resolvePlacement({
            saved: {
                bounds: { x: 200, y: -300, width: 1000, height: 700 },
                maximized: false,
                fullScreen: false,
                displayId: 1,
            },
            openOn: "last",
            displays,
            primary: laptop,
            defaults: view3dDefaults,
        });
        expect(placement.bounds).toEqual({
            x: 200,
            y: 25,
            width: 1000,
            height: 700,
        });
    });

    it("trusts normal bounds over the display id for a window that wasn't maximized", () => {
        // Mostly on the laptop, its display id from a slightly different overlap rule
        const saved = {
            bounds: { x: 100, y: 100, width: 1000, height: 700 },
            maximized: false,
            fullScreen: false,
            displayId: 2,
        };
        expect(
            resolvePlacement({
                saved,
                openOn: "last",
                displays,
                primary: laptop,
                defaults: view3dDefaults,
            }).bounds,
        ).toEqual(saved.bounds);
    });
});

describe("parseSavedWindowState rejects corrupt sizes", () => {
    it("ignores values beyond any real desktop", () => {
        expect(
            parseSavedWindowState({
                bounds: { x: 0, y: 0, width: 1e12, height: 800 },
            }),
        ).toBeUndefined();
    });
});
