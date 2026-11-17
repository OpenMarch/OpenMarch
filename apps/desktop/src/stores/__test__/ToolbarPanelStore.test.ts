import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_TOOLBAR_PANEL,
    parseToolbarPanel,
    pressToolbarTab,
    TOOLBAR_PANEL_STORAGE_KEY,
    useToolbarPanelStore,
} from "../ToolbarPanelStore";

const stored = () =>
    JSON.parse(localStorage.getItem(TOOLBAR_PANEL_STORAGE_KEY) ?? "null");

describe("parseToolbarPanel", () => {
    it("starts closed on Alignment with nothing remembered", () => {
        expect(parseToolbarPanel(null)).toEqual({
            tab: "alignment",
            open: false,
        });
    });

    it("reads a remembered tab and open panel", () => {
        expect(parseToolbarPanel('{"tab":"shapes","open":true}')).toEqual({
            tab: "shapes",
            open: true,
        });
    });

    it.each([
        ["not JSON", "{"],
        ["not an object", "3"],
        ["null", "null"],
    ])("falls back to the default for %s", (_, raw) => {
        expect(parseToolbarPanel(raw)).toEqual(DEFAULT_TOOLBAR_PANEL);
    });

    it("keeps what it can read of a partly unknown value", () => {
        expect(parseToolbarPanel('{"tab":"view","open":true}')).toEqual({
            tab: "alignment",
            open: true,
        });
        expect(parseToolbarPanel('{"tab":"select","open":"yes"}')).toEqual({
            tab: "select",
            open: false,
        });
    });
});

describe("pressToolbarTab", () => {
    it("opens the panel on a tab that wasn't open", () => {
        expect(pressToolbarTab("file", false)).toEqual({
            tab: "file",
            open: true,
        });
    });

    it("closes the panel when its open tab is tapped again", () => {
        expect(pressToolbarTab("file", true)).toEqual({
            tab: "file",
            open: false,
        });
    });
});

describe("useToolbarPanelStore", () => {
    beforeEach(() => {
        localStorage.clear();
        useToolbarPanelStore.setState(DEFAULT_TOOLBAR_PANEL);
    });

    it("remembers the tab and that the panel is open", () => {
        useToolbarPanelStore.getState().pressTab("select", false);
        expect(useToolbarPanelStore.getState()).toMatchObject({
            tab: "select",
            open: true,
        });
        expect(stored()).toEqual({ tab: "select", open: true });
    });

    it("remembers a closed panel and keeps its tab", () => {
        useToolbarPanelStore.getState().pressTab("shapes", false);
        useToolbarPanelStore.getState().setOpen(false);
        expect(stored()).toEqual({ tab: "shapes", open: false });
        // Read back as a new window would
        expect(
            parseToolbarPanel(localStorage.getItem(TOOLBAR_PANEL_STORAGE_KEY)),
        ).toEqual({ tab: "shapes", open: false });
    });

    it("changes the tab without opening or closing the panel", () => {
        useToolbarPanelStore.getState().setTab("file");
        expect(useToolbarPanelStore.getState()).toMatchObject({
            tab: "file",
            open: false,
        });
    });
});

describe("the store at startup", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    /** A new window: the store module loads again and reads storage once */
    const freshStore = async () =>
        (await import("../ToolbarPanelStore")).useToolbarPanelStore.getState();

    it("opens as it was left, from openmarch:toolbarPanel", async () => {
        localStorage.setItem(
            "openmarch:toolbarPanel",
            JSON.stringify({ tab: "shapes", open: true }),
        );
        expect(await freshStore()).toMatchObject({
            tab: "shapes",
            open: true,
        });
    });

    it("starts closed on Alignment with nothing saved", async () => {
        expect(await freshStore()).toMatchObject({
            tab: "alignment",
            open: false,
        });
    });

    it("starts closed on Alignment when what's saved is unreadable", async () => {
        localStorage.setItem("openmarch:toolbarPanel", "{not json");
        expect(await freshStore()).toMatchObject({
            tab: "alignment",
            open: false,
        });
    });
});
