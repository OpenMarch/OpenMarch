import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
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
        const off = registerActionHandler("timelineTapBeats4", {
            run,
            isEnabled: () => enabled,
        });
        expect(isActionEnabled("timelineTapBeats4")).toBe(false);
        expect(runAction("timelineTapBeats4")).toBe(false);
        enabled = true;
        runAction("timelineTapBeats4");
        expect(run).toHaveBeenCalledWith({ count: 4 });
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
                ["timelineTapBeats1", "timelineTapBeats2"],
                run,
            ),
        );
        runAction("timelineTapBeats2");
        expect(run).toHaveBeenCalledWith("timelineTapBeats2", { count: 2 });
        unmount();
        expect(hasActionHandler("timelineTapBeats1")).toBe(false);
    });
});
