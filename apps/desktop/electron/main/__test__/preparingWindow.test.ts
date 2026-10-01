// @vitest-environment node
/**
 * The "preparing your file" window (P9.3) never leaves a window behind: the
 * window can't be closed by hand, so any failure while showing it must destroy
 * it. Uses a fake window in place of a `BrowserWindow`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    describePreparingProgress,
    showPreparingProgress,
    showPreparingWindow,
    throttleProgress,
    type PreparingParent,
    type PreparingWindow,
} from "../preparingWindow";

function fakeWindow(
    overrides: Partial<{
        loadURL: () => Promise<void>;
        executeJavaScript: () => Promise<unknown>;
        readyToShow: boolean;
    }> = {},
) {
    const state = { destroyed: false, shown: false, destroyCalls: 0 };
    const window: PreparingWindow = {
        once: (_event, listener) => {
            if (overrides.readyToShow !== false) setTimeout(listener, 0);
        },
        loadURL: overrides.loadURL ?? (async () => {}),
        show: () => {
            state.shown = true;
        },
        destroy: () => {
            state.destroyCalls++;
            state.destroyed = true;
        },
        isDestroyed: () => state.destroyed,
        webContents: {
            executeJavaScript:
                overrides.executeJavaScript ?? (async () => true),
        },
    };
    return { window, state };
}

function fakeParent() {
    const progress: number[] = [];
    const parent: PreparingParent = {
        setProgressBar: (p) => progress.push(p),
        isDestroyed: () => false,
    };
    return { parent, progress };
}

describe("showPreparingWindow", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it("shows the window and waits for it to paint", async () => {
        const { window, state } = fakeWindow();
        const { parent, progress } = fakeParent();

        const shown = await showPreparingWindow(
            parent,
            "show.dots",
            () => window,
        );

        expect(shown).toBe(window);
        expect(state).toMatchObject({ shown: true, destroyed: false });
        expect(progress).toEqual([2]);
    });

    it("destroys the window when its webContents is gone before the paint wait", async () => {
        const { window, state } = fakeWindow({
            executeJavaScript: () =>
                Promise.reject(new Error("Object has been destroyed")),
        });
        const { parent, progress } = fakeParent();

        const shown = await showPreparingWindow(
            parent,
            "show.dots",
            () => window,
        );

        expect(shown).toBeUndefined();
        expect(state.destroyCalls).toBe(1);
        expect(progress).toEqual([2, -1]);
    });

    it("destroys the window when loading its page fails", async () => {
        const { window, state } = fakeWindow({
            loadURL: () => Promise.reject(new Error("ERR_FAILED")),
        });
        const { parent } = fakeParent();

        expect(
            await showPreparingWindow(parent, "show.dots", () => window),
        ).toBeUndefined();
        expect(state).toMatchObject({ shown: false, destroyCalls: 1 });
    });

    it("returns nothing, without throwing, when the window can't be made", async () => {
        const { parent } = fakeParent();

        expect(
            await showPreparingWindow(parent, "show.dots", () => {
                throw new Error("no display");
            }),
        ).toBeUndefined();
    });
});

describe("showPreparingProgress (P9.8)", () => {
    /** Runs the window's script against a fake status line and bar. */
    function fakePage() {
        const status = { textContent: "" };
        const bar: { value?: number; removeAttribute(name: string): void } = {
            removeAttribute(name) {
                if (name === "value") delete bar.value;
            },
        };
        const document = {
            getElementById: (id: string) =>
                id === "status" ? status : id === "bar" ? bar : null,
        };
        const executeJavaScript = async (code: string) =>
            // eslint-disable-next-line no-new-func
            new Function("document", `return ${code}`)(document) as unknown;
        return { status, bar, executeJavaScript };
    }

    it("shows the backup, then pages done out of total, in the window and on the taskbar", async () => {
        const page = fakePage();
        const { window } = fakeWindow({
            executeJavaScript: page.executeJavaScript as () => Promise<unknown>,
        });
        const { parent, progress } = fakeParent();

        showPreparingProgress(window, parent, { phase: "backup" });
        await Promise.resolve();
        expect(page.status.textContent).toBe("Backing up…");
        expect(page.bar.value).toBeUndefined();

        showPreparingProgress(window, parent, {
            phase: "convert",
            pagesDone: 25,
            pagesTotal: 100,
        });
        await Promise.resolve();
        expect(page.status.textContent).toBe("Converting page 25 of 100…");
        expect(page.bar.value).toBe(0.25);
        expect(progress).toEqual([2, 0.25]);
    });

    it("never throws, with no window, a destroyed one, or a failing script", () => {
        const { parent } = fakeParent();
        expect(() =>
            showPreparingProgress(undefined, undefined, { phase: "backup" }),
        ).not.toThrow();
        const { window, state } = fakeWindow({
            executeJavaScript: async () => {
                throw new Error("gone");
            },
        });
        expect(() =>
            showPreparingProgress(window, parent, { phase: "backup" }),
        ).not.toThrow();
        state.destroyed = true;
        expect(() =>
            showPreparingProgress(window, parent, {
                phase: "convert",
                pagesDone: 0,
                pagesTotal: 0,
            }),
        ).not.toThrow();
        expect(
            describePreparingProgress({
                phase: "convert",
                pagesDone: 0,
                pagesTotal: 0,
            }).fraction,
        ).toBeUndefined();
    });
});

describe("throttleProgress (P9.8)", () => {
    it("passes on at most one update per interval, plus each new phase and the final page", () => {
        let t = 0;
        const shown: string[] = [];
        const report = throttleProgress(
            (p) =>
                shown.push(
                    p.phase === "backup"
                        ? "backup"
                        : `${p.pagesDone}/${p.pagesTotal}`,
                ),
            100,
            () => t,
        );

        report({ phase: "backup" });
        // 200 pages, 2 ms apart: 400 ms of progress.
        for (let page = 1; page <= 200; page++) {
            t += 2;
            report({ phase: "convert", pagesDone: page, pagesTotal: 200 });
        }

        expect(shown[0]).toBe("backup");
        expect(shown[1]).toBe("1/200"); // the new phase, at once
        expect(shown.at(-1)).toBe("200/200"); // always the final state
        expect(shown.length).toBeLessThanOrEqual(2 + 4 + 1);
        expect(shown.length).toBeGreaterThanOrEqual(5);
    });
});
