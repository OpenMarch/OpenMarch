import { describe, expect, it, vi } from "vitest";
import { registerDrawWaker, requestDraw } from "../drawWake";

describe("requestDraw", () => {
    it("does nothing before a scene registers, then reaches the registered waker", () => {
        expect(() => requestDraw(100)).not.toThrow();
        const waker = vi.fn();
        const unregister = registerDrawWaker(waker);
        requestDraw(250);
        expect(waker).toHaveBeenCalledWith(250);
        unregister();
        requestDraw(10);
        expect(waker).toHaveBeenCalledTimes(1);
    });

    it("keeps only the newest waker, and an old unregister doesn't remove a newer one", () => {
        const a = vi.fn();
        const b = vi.fn();
        const offA = registerDrawWaker(a);
        registerDrawWaker(b);
        offA();
        requestDraw(5);
        expect(a).not.toHaveBeenCalled();
        expect(b).toHaveBeenCalledWith(5);
    });
});
