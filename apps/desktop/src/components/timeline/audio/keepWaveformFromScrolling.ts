import type WaveSurfer from "wavesurfer.js";

/**
 * Wavesurfer wraps the waveform in its own horizontal scroller. Ours is sized
 * to the whole song, so that inner scroller only ever has a pixel or two to
 * move, yet a finger panning on the waveform scrolls it (nothing visible
 * happens) instead of the timeline. Turning its user scrolling off lets the
 * pan reach the timeline. Wavesurfer resets it on each render, hence the
 * redraw hook. Returns the unsubscribe.
 */
export function keepWaveformFromScrolling(ws: WaveSurfer): () => void {
    const apply = () => {
        const scroller = ws.getWrapper()?.parentElement;
        if (scroller) scroller.style.overflowX = "hidden";
    };
    apply();
    return ws.on("redraw", apply);
}
