import { create } from "zustand";

/**
 * The selected audio's loudness over time, for the timeline's waveform lane (UI-12): the largest
 * absolute sample in each `1 / rate` seconds, across every channel, on the show's clock (the
 * audio player publishes it after applying the audio offset). `null` with no audio loaded.
 */
export interface AudioEnvelope {
    readonly peaks: Float32Array;
    /** Envelope values per second */
    readonly rate: number;
}

/** How many envelope values a second of audio gets: fine enough for 64px-a-beat zoom */
export const AUDIO_ENVELOPE_RATE = 200;

/** How many peaks a beat gets: finer than the bars at the deepest zoom, so bars never step */
export const WAVEFORM_PEAKS_PER_BEAT = 32;

/** Each bar's width and the gap after it, in pixels, at any zoom: the old WaveSurfer look */
export const WAVEFORM_BAR_WIDTH = 2;
export const WAVEFORM_BAR_GAP = 1;

export const useAudioEnvelopeStore = create<{
    readonly envelope: AudioEnvelope | null;
    readonly setEnvelope: (envelope: AudioEnvelope | null) => void;
}>((set) => ({
    envelope: null,
    setEnvelope: (envelope) => set({ envelope }),
}));

/** The envelope of decoded audio (an `AudioBuffer`, or anything shaped like one). */
export function audioEnvelope(
    buffer: {
        readonly numberOfChannels: number;
        readonly sampleRate: number;
        readonly length: number;
        getChannelData(channel: number): Float32Array;
    },
    rate = AUDIO_ENVELOPE_RATE,
): AudioEnvelope {
    const window = Math.max(1, Math.round(buffer.sampleRate / rate));
    const peaks = new Float32Array(Math.ceil(buffer.length / window));
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        // Window by window, so a long show's millions of samples cost no division each
        for (
            let slot = 0, start = 0;
            slot < peaks.length && start < data.length;
            slot++, start += window
        ) {
            const end = Math.min(start + window, data.length);
            let peak = peaks[slot]!;
            for (let i = start; i < end; i++) {
                const magnitude = Math.abs(data[i]!);
                if (magnitude > peak) peak = magnitude;
            }
            peaks[slot] = peak;
        }
    }
    return { peaks, rate: buffer.sampleRate / window };
}

/**
 * The waveform's peaks for each beat on the timeline's view axis (`offset` hidden beats first,
 * see `createTimelineBeatAxis`): `perBeat` values a beat, each the loudest moment in its slice of
 * the beat's time, as a fraction of the loudest moment the show's beats cover (applause after the
 * last beat doesn't set the scale). A linear scale, as the old WaveSurfer waveform drew: quiet
 * passages stay low and calm instead of filling the lane. Beats past the audio get none.
 */
export function peaksByBeat(
    envelope: AudioEnvelope,
    beats: readonly { readonly timestamp: number; readonly duration: number }[],
    offset: number,
    perBeat = WAVEFORM_PEAKS_PER_BEAT,
): number[][] {
    const at = (seconds: number) =>
        Math.min(
            envelope.peaks.length,
            Math.max(0, Math.floor(seconds * envelope.rate)),
        );
    const shown = beats.slice(offset);
    const raw = shown.map((beat) => {
        if (at(beat.timestamp) >= envelope.peaks.length) return [];
        return Array.from({ length: perBeat }, (_, slice) => {
            const from = at(beat.timestamp + (beat.duration * slice) / perBeat);
            const to = Math.max(
                from + 1,
                at(beat.timestamp + (beat.duration * (slice + 1)) / perBeat),
            );
            let peak = 0;
            for (let i = from; i < to && i < envelope.peaks.length; i++)
                if (envelope.peaks[i]! > peak) peak = envelope.peaks[i]!;
            return peak;
        });
    });
    let loudest = 0;
    for (const beat of raw)
        for (const peak of beat) loudest = Math.max(loudest, peak);
    if (loudest <= 0) return raw.map((beat) => beat.map(() => 0));
    return raw.map((beat) => beat.map((peak) => Math.min(1, peak / loudest)));
}

/**
 * One waveform bar's height, 0 .. 1: the loudest peak in the beats `from` .. `to` (fractional,
 * on the view axis). Bars sit at a fixed pixel pitch, so each takes whatever peaks it covers.
 */
export function waveformBarLevel(
    peaks: readonly (readonly number[])[],
    from: number,
    to: number,
): number {
    let level = 0;
    // Bar edges are float math on beats; nudge `to` back so an edge on a slice line stays exclusive
    to -= 1e-9;
    const last = Math.min(peaks.length, Math.ceil(to));
    for (let beat = Math.max(0, Math.floor(from)); beat < last; beat++) {
        const slices = peaks[beat]!;
        const n = slices.length;
        if (n === 0) continue;
        const first = Math.max(0, Math.floor((from - beat) * n));
        const end = Math.min(n, Math.ceil((to - beat) * n));
        for (let i = first; i < end; i++)
            if (slices[i]! > level) level = slices[i]!;
    }
    return level;
}
