import { describe, expect, it, vi } from "vitest";
import { needsResume, startAudioUnlock } from "../audioUnlock";

const fakeContext = (state: AudioContextState | "interrupted") => {
    const source = { connect: vi.fn(), start: vi.fn(), buffer: null };
    return {
        state,
        sampleRate: 44100,
        destination: {},
        resume: vi.fn(() => Promise.resolve()),
        createBuffer: vi.fn(() => ({})),
        createBufferSource: vi.fn(() => source),
        source,
    };
};

describe("needsResume", () => {
    it("resumes suspended and interrupted contexts only", () => {
        expect(needsResume({ state: "suspended" })).toBe(true);
        expect(needsResume({ state: "interrupted" as AudioContextState })).toBe(
            true,
        );
        expect(needsResume({ state: "running" })).toBe(false);
        expect(needsResume({ state: "closed" })).toBe(false);
    });
});

describe("startAudioUnlock", () => {
    it("resumes on each press, plays silence once, and stops", () => {
        const target = new EventTarget() as unknown as Window;
        const context = fakeContext("suspended");
        let current: unknown = null;
        const stop = startAudioUnlock(
            () => [current as AudioContext | null],
            target,
        );

        // No context yet (no show open): nothing to do
        target.dispatchEvent(new Event("touchend"));

        current = context;
        target.dispatchEvent(new Event("touchend"));
        expect(context.resume).toHaveBeenCalledTimes(1);
        expect(context.source.start).toHaveBeenCalledTimes(1);

        target.dispatchEvent(new Event("keydown"));
        expect(context.resume).toHaveBeenCalledTimes(2);
        expect(context.source.start).toHaveBeenCalledTimes(1);

        stop();
        target.dispatchEvent(new Event("pointerup"));
        expect(context.resume).toHaveBeenCalledTimes(2);
    });
    it("leaves a running context alone", () => {
        const target = new EventTarget() as unknown as Window;
        const context = fakeContext("running");
        startAudioUnlock(() => [context as unknown as AudioContext], target);
        target.dispatchEvent(new Event("pointerdown"));
        expect(context.resume).not.toHaveBeenCalled();
        expect(context.source.start).not.toHaveBeenCalled();
    });
});
