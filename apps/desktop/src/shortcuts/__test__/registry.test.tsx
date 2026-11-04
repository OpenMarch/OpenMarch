import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getActionPaletteItems } from "../palette/actionSource";
import {
    actionIgnoresRepeat,
    hasActionHandler,
    isActionEnabled,
    registerActionHandler,
    runAction,
    subscribeToActionHandlers,
} from "../registry";
import { useActionHandler, useActionHandlerGroup } from "../useActionHandler";

describe("registry", () => {
    it("runs the most recent handler and falls back on unregister", () => {
        const first = vi.fn();
        const second = vi.fn();
        const offFirst = registerActionHandler("nextPage", {
            run: first,
            isEnabled: () => true,
        });
        const offSecond = registerActionHandler("nextPage", {
            run: second,
            isEnabled: () => true,
        });

        expect(runAction("nextPage")).toBe(true);
        expect(second).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();

        offSecond();
        runAction("nextPage");
        expect(first).toHaveBeenCalledTimes(1);

        offFirst();
        expect(hasActionHandler("nextPage")).toBe(false);
        expect(runAction("nextPage")).toBe(false);
    });

    it("passes definition args and respects enabled", () => {
        const run = vi.fn();
        let enabled = false;
        const off = registerActionHandler("exportCoordinateSheets", {
            run,
            isEnabled: () => enabled,
        });
        expect(isActionEnabled("exportCoordinateSheets")).toBe(false);
        expect(runAction("exportCoordinateSheets")).toBe(false);
        enabled = true;
        runAction("exportCoordinateSheets");
        expect(run).toHaveBeenCalledWith({ tab: "coordinate-sheets" });
        off();
    });

    it("notifies subscribers", () => {
        const listener = vi.fn();
        const unsubscribe = subscribeToActionHandlers(listener);
        const off = registerActionHandler("lockX", {
            run: () => {},
            isEnabled: () => true,
        });
        off();
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
    });
});

describe("useActionHandler", () => {
    it("uses the latest closure without re-registering", () => {
        const calls: number[] = [];
        const { rerender, unmount } = renderHook(
            ({ value }) => useActionHandler("lockY", () => calls.push(value)),
            { initialProps: { value: 1 } },
        );
        rerender({ value: 2 });
        runAction("lockY");
        expect(calls).toEqual([2]);
        unmount();
        expect(hasActionHandler("lockY")).toBe(false);
    });

    it("group registers every id", () => {
        const run = vi.fn();
        const { unmount } = renderHook(() =>
            useActionHandlerGroup(
                ["exportCoordinateSheets", "exportDrillCharts"],
                run,
            ),
        );
        runAction("exportDrillCharts");
        expect(run).toHaveBeenCalledWith("exportDrillCharts", {
            tab: "drill-charts",
        });
        unmount();
        expect(hasActionHandler("exportCoordinateSheets")).toBe(false);
    });

    it("group with no ids registers nothing", () => {
        const listener = vi.fn();
        const off = subscribeToActionHandlers(listener);
        const { unmount } = renderHook(() =>
            useActionHandlerGroup([], vi.fn()),
        );
        expect(listener).not.toHaveBeenCalled();
        unmount();
        off();
    });

    it("reads an ignoreRepeat function at each repeat", () => {
        let busy = false;
        const { unmount } = renderHook(() =>
            useActionHandler("performUndo", () => {}, {
                ignoreRepeat: () => busy,
            }),
        );
        expect(actionIgnoresRepeat("performUndo")).toBe(false);
        busy = true;
        expect(actionIgnoresRepeat("performUndo")).toBe(true);
        unmount();
    });

    it("shows a handler's label in the palette while it gives one, the definition's otherwise", () => {
        const t = (key: string) => key;
        const labelOf = () =>
            getActionPaletteItems({ t }, {}).find(
                (item) => item.id === "action:lockX",
            )?.label;
        const { rerender, unmount } = renderHook(
            ({ label }: { label?: string }) =>
                useActionHandler("lockX", () => {}, { label }),
            { initialProps: { label: "Lock X on Page 3" } },
        );
        expect(labelOf()).toBe("Lock X on Page 3");
        rerender({ label: undefined });
        expect(labelOf()).toBe("actions.alignment.lockX");
        unmount();
    });

    it("reads a label or enabled given as a function only when asked, not on render (#573 review)", () => {
        const t = (key: string) => key;
        const label = vi.fn(() => "Lock X on Page 4");
        const enabled = vi.fn(() => false);
        const { rerender, unmount } = renderHook(() =>
            useActionHandler("lockX", () => {}, { label, enabled }),
        );
        rerender();
        expect(label).not.toHaveBeenCalled();
        expect(enabled).not.toHaveBeenCalled();

        const item = getActionPaletteItems({ t }, {}).find(
            (i) => i.id === "action:lockX",
        );
        expect(item?.label).toBe("Lock X on Page 4");
        expect(isActionEnabled("lockX")).toBe(false);
        expect(runAction("lockX")).toBe(false);
        unmount();
    });
});
