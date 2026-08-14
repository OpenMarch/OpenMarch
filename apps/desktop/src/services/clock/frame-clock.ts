import { createSelectors } from "@/utilities/zustand";
import { useShallow } from "zustand/react/shallow";
import { create } from "zustand";

interface ClockState {
    /** The currentTime in milliseconds */
    currentTime: number;
    /** The currentTime in seconds */
    getAudioTime: () => number;
    /** Incrementing version number. Only used to force a re-render */
    _version: number;
    playing: boolean;
    audioContext: AudioContext | null;
    audioTimeToShowTime: (elapsedAudioSeconds: number) => number;

    // Internal bookkeeping. Zustand has no real privacy, but treat these
    // as implementation details — don't read them from outside the store.
    _rafId: number | null;
    _playbackStartAudioTime: number;
    _playbackStartShowTime: number;

    /** Must be called once, from a user-gesture handler (AudioContext requires this). */
    init: (
        audioContext: AudioContext,
        audioTimeToShowTime: ClockState["audioTimeToShowTime"],
    ) => void;

    play: () => void;
    pause: () => void;
    seek: (timestamp: number) => void;
}

const frameClockStoreBase = create<ClockState>()((set, get) => ({
    currentTime: 0,
    getAudioTime: () => get().currentTime / 1000,
    _version: 0,
    playing: false,
    audioContext: null,
    audioTimeToShowTime: (s) => s * 1000, // overwritten by init()

    _rafId: null,
    _playbackStartAudioTime: 0,
    _playbackStartShowTime: 0,

    init: (audioContext, audioTimeToShowTime) => {
        set({ audioContext, audioTimeToShowTime });
    },

    play: () => {
        const { audioContext, playing } = get();
        if (playing || !audioContext) return;

        if (audioContext.state === "suspended") {
            void audioContext.resume();
        }

        set({
            playing: true,
            _playbackStartAudioTime: audioContext.currentTime,
            _playbackStartShowTime: get().currentTime,
        });

        tick(get, set);
    },

    pause: () => {
        const { _rafId } = get();
        if (_rafId !== null) cancelAnimationFrame(_rafId);
        set({ playing: false, _rafId: null });
    },

    seek: (timestamp) => {
        const { audioContext, playing } = get();
        set({
            currentTime: timestamp,
            ...(playing && audioContext
                ? {
                      _playbackStartAudioTime: audioContext.currentTime,
                      _playbackStartShowTime: timestamp,
                  }
                : {}),
        });
    },
}));

export const useFrameClockStore = createSelectors(frameClockStoreBase);

// R-A-F loop lives outside the store definition so it can schedule itself
// recursively without fighting Zustand's action typing.
function tick(
    get: () => ClockState,
    set: (partial: Partial<ClockState>) => void,
) {
    const {
        playing,
        audioContext,
        audioTimeToShowTime,
        _playbackStartAudioTime,
        _playbackStartShowTime,
    } = get();
    if (!playing || !audioContext) return;

    const elapsedAudioSeconds =
        audioContext.currentTime - _playbackStartAudioTime;
    const currentTime =
        _playbackStartShowTime + audioTimeToShowTime(elapsedAudioSeconds);

    set({ currentTime });

    const rafId = requestAnimationFrame(() => tick(get, set));
    set({ _rafId: rafId });
}

/* ---------------------------------------------------------------------- */
/* Access patterns                                                        */
/* ---------------------------------------------------------------------- */
/**
 * @param onTick callback function to call on a `tick` event. Accepts a time in milliseconds
 * @returns function to unsubscribe
 */
export function subscribeToFrameClock(
    onTick: (timeMs: number) => void,
): () => void {
    // Uses Zustand's `subscribe` function to subscribe outside of the React cycle
    return useFrameClockStore.subscribe((state) => {
        onTick(state.currentTime);
    });
}

// 3. Reactive selector hooks — for UI elements that should re-render.
//    Zustand bails out on re-render if the selected slice is unchanged,
//    so usePlaying() only re-renders on play/pause, not every tick.
export const useIsPlaying = () => useFrameClockStore.use.playing();
export const useCurrentTime = () => useFrameClockStore.use.currentTime();

export const usePlaybackControls = () =>
    useFrameClockStore(
        useShallow((state) => ({
            play: state.play,
            pause: state.pause,
            seek: state.seek,
        })),
    );

/**
 * Example usage:
 *
 * // App bootstrap, inside a click handler:
 * <button onClick={initClock}>Enable audio</button>
 *
 * // Canvas controller (non-React class), in its setup method:
 * const unsubscribe = subscribeToFrameClock((timestamp) => {
 *   this.draw(getPositions(timestamp), getAppearance(timestamp));
 * });
 *
 * // React play/pause button:
 * function PlayButton() {
 *   const playing = usePlaying();
 *   const { play, pause } = usePlaybackControls();
 *   return <button onClick={playing ? pause : play}>{playing ? "Pause" : "Play"}</button>;
 * }
 */
