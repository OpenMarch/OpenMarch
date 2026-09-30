import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
    subscribeToFrameClock,
    useCurrentBeatIndex,
    useCurrentTime,
    useFrameClockStore,
    useIsPlaying,
    usePlaybackControls,
} from "../frame-clock";

/**
 * jsdom has no Web Audio. The clock only reads `currentTime` and `state` and calls `resume()`,
 * so a stand-in whose time the test advances is enough.
 */
class FakeAudioContext {
    currentTime = 0;
    state: AudioContextState = "running";
    resume = vi.fn(async () => {
        this.state = "running";
    });
}

const initialState = useFrameClockStore.getState();
let audio: FakeAudioContext;

/** Advances the audio clock and fires one animation frame. */
function advance(seconds: number) {
    audio.currentTime += seconds;
    vi.advanceTimersToNextFrame();
}

describe("frame clock", () => {
    beforeEach(() => {
        vi.useFakeTimers({
            toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
        });
        useFrameClockStore.setState(initialState, true);
        audio = new FakeAudioContext();
        useFrameClockStore
            .getState()
            .init(audio as unknown as AudioContext, (s) => s * 1000);
    });

    afterEach(() => {
        useFrameClockStore.getState().pause();
        vi.useRealTimers();
    });

    it("starts paused at time 0 and beat 0", () => {
        const state = useFrameClockStore.getState();
        expect(state.playing).toBe(false);
        expect(state.currentTime).toBe(0);
        expect(state.currentBeatIndex).toBe(0);
        expect(state.getAudioTime()).toBe(0);
    });

    it("does nothing on play before init", () => {
        useFrameClockStore.setState(initialState, true);
        useFrameClockStore.getState().play();
        expect(useFrameClockStore.getState().playing).toBe(false);
    });

    it("advances currentTime from the audio clock on each frame", () => {
        audio.currentTime = 10; // the AudioContext has been running for a while
        useFrameClockStore.getState().play();
        expect(useFrameClockStore.getState().playing).toBe(true);
        expect(useFrameClockStore.getState().currentTime).toBe(0);

        advance(0.5);
        expect(useFrameClockStore.getState().currentTime).toBeCloseTo(500, 9);
        advance(0.25);
        expect(useFrameClockStore.getState().currentTime).toBeCloseTo(750, 9);
        expect(useFrameClockStore.getState().getAudioTime()).toBeCloseTo(
            0.75,
            9,
        );
    });

    it("maps audio time to show time with the function passed to init", () => {
        useFrameClockStore
            .getState()
            .init(audio as unknown as AudioContext, (s) => s * 2000);
        useFrameClockStore.getState().play();
        advance(1);
        expect(useFrameClockStore.getState().currentTime).toBeCloseTo(2000, 9);
    });

    it("resumes a suspended AudioContext on play", () => {
        audio.state = "suspended";
        useFrameClockStore.getState().play();
        expect(audio.resume).toHaveBeenCalledOnce();
    });

    it("ignores play while already playing", () => {
        useFrameClockStore.getState().play();
        advance(1);
        useFrameClockStore.getState().play();
        advance(1);
        expect(useFrameClockStore.getState().currentTime).toBeCloseTo(2000, 9);
    });

    it("stops advancing on pause and continues from there on play", () => {
        useFrameClockStore.getState().play();
        advance(1);
        useFrameClockStore.getState().pause();
        expect(useFrameClockStore.getState().playing).toBe(false);
        expect(useFrameClockStore.getState()._rafId).toBeNull();

        advance(5); // audio keeps running while paused
        expect(useFrameClockStore.getState().currentTime).toBeCloseTo(1000, 9);

        useFrameClockStore.getState().play();
        advance(0.5);
        expect(useFrameClockStore.getState().currentTime).toBeCloseTo(1500, 9);
    });

    it("snaps the time on pause with the onPause policy", () => {
        useFrameClockStore
            .getState()
            .setOnPause((ms) => Math.floor(ms / 1000) * 1000);
        useFrameClockStore.getState().play();
        advance(1.7);
        useFrameClockStore.getState().pause();
        expect(useFrameClockStore.getState().currentTime).toBe(1000);

        useFrameClockStore.getState().setOnPause(null);
        useFrameClockStore.getState().play();
        advance(0.3);
        useFrameClockStore.getState().pause();
        expect(useFrameClockStore.getState().currentTime).toBeCloseTo(1300, 9);
    });

    it("seeks while paused without starting playback", () => {
        useFrameClockStore.getState().seek(4200);
        expect(useFrameClockStore.getState().currentTime).toBe(4200);
        expect(useFrameClockStore.getState().playing).toBe(false);
        advance(1);
        expect(useFrameClockStore.getState().currentTime).toBe(4200);
    });

    it("seeks while playing and keeps playing from the new time", () => {
        useFrameClockStore.getState().play();
        advance(1);
        useFrameClockStore.getState().seek(10_000);
        expect(useFrameClockStore.getState().currentTime).toBe(10_000);
        advance(0.5);
        expect(useFrameClockStore.getState().currentTime).toBeCloseTo(
            10_500,
            9,
        );
    });

    it("stores currentBeatIndex and only updates it on change", () => {
        const listener = vi.fn();
        const unsubscribe = useFrameClockStore.subscribe(listener);
        useFrameClockStore.getState().setCurrentBeatIndex(3);
        expect(useFrameClockStore.getState().currentBeatIndex).toBe(3);
        useFrameClockStore.getState().setCurrentBeatIndex(3);
        expect(listener).toHaveBeenCalledOnce();
        unsubscribe();
    });

    it("notifies subscribeToFrameClock on every tick until unsubscribed", () => {
        const onTick = vi.fn();
        const unsubscribe = subscribeToFrameClock(onTick);
        useFrameClockStore.getState().play();
        advance(0.1);
        expect(onTick).toHaveBeenLastCalledWith(
            useFrameClockStore.getState().currentTime,
        );
        const calls = onTick.mock.calls.length;
        unsubscribe();
        advance(0.1);
        expect(onTick).toHaveBeenCalledTimes(calls);
    });

    it("exposes reactive hooks for playing, time and beat", () => {
        const { result } = renderHook(() => ({
            playing: useIsPlaying(),
            time: useCurrentTime(),
            beat: useCurrentBeatIndex(),
            controls: usePlaybackControls(),
        }));
        expect(result.current.playing).toBe(false);

        act(() => {
            result.current.controls.play();
        });
        expect(result.current.playing).toBe(true);

        act(() => advance(0.25));
        expect(result.current.time).toBeCloseTo(250, 9);

        act(() => {
            useFrameClockStore.getState().setCurrentBeatIndex(2);
        });
        expect(result.current.beat).toBe(2);

        act(() => {
            result.current.controls.pause();
        });
        expect(result.current.playing).toBe(false);
        act(() => {
            result.current.controls.seek(0);
        });
        expect(result.current.time).toBe(0);
    });
});
