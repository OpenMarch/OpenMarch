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

/**
 * How the waveform is drawn, a setting: `simplified` is rounded bars at a fixed pixel pitch on a
 * linear scale (the old WaveSurfer look); `precise` is square bars locked to each beat on a
 * decibel scale, so quiet passages show their detail (UI-12); `hidden` drops the waveform lane,
 * as if the show had no audio, for designers who don't need it.
 */
export type WaveformStyle = "simplified" | "precise" | "hidden";
export const WAVEFORM_STYLES: readonly WaveformStyle[] = [
    "simplified",
    "precise",
    "hidden",
];

/** A stored waveform style, or the default (simplified) when it's missing or unknown */
export function parseWaveformStyle(value: unknown): WaveformStyle {
    return WAVEFORM_STYLES.find((style) => style === value) ?? "simplified";
}

/** How many bars a beat gets in the precise style */
export const WAVEFORM_PRECISE_BARS_PER_BEAT = 8;

/** The quietest level the precise style draws, in dB below the show's loudest moment */
export const WAVEFORM_FLOOR_DB = 42;

/** A linear level (0 .. 1 of the loudest moment) on the decibel scale: `-WAVEFORM_FLOOR_DB` .. 0 dB onto 0 .. 1 */
export function waveformLevelDb(level: number): number {
    if (level <= 0) return 0;
    return Math.min(
        1,
        Math.max(
            0,
            (20 * Math.log10(level) + WAVEFORM_FLOOR_DB) / WAVEFORM_FLOOR_DB,
        ),
    );
}

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

/** The corner radius of a style's bars: pills when simplified, square when precise */
export function waveformBarRadius(style: WaveformStyle): number {
    return style === "precise" ? 0 : WAVEFORM_BAR_WIDTH / 2;
}

/** Half a bar's height for a level in a lane `height` tall: any sound at all keeps a sliver */
export function waveformBarHalfHeight(level: number, height: number): number {
    return Math.max(0.5, Math.min(1, Math.max(0, level)) * (height / 2 - 1));
}

/**
 * Lays out the waveform's bars from `from` to `to` pixels in a style, calling `draw` with each
 * bar's left edge, width and level (0 .. 1, on the style's scale), skipping silent bars.
 * Simplified bars sit at a fixed pixel pitch on a linear scale; precise bars are a slice of a beat
 * each, on the decibel scale. The timeline and the setting's preview both draw through this.
 */
export function forEachWaveformBar(
    peaks: readonly (readonly number[])[],
    style: WaveformStyle,
    pixelsPerBeat: number,
    from: number,
    to: number,
    draw: (x: number, width: number, level: number) => void,
): void {
    if (style === "hidden") return;
    if (style === "precise") {
        const sliceWidth = pixelsPerBeat / WAVEFORM_PRECISE_BARS_PER_BEAT;
        // A gap between bars only once they're wide enough; narrower, they read as one shape
        const barWidth =
            sliceWidth >= 3 ? sliceWidth - 1 : Math.max(1, sliceWidth);
        const last = Math.ceil(to / sliceWidth);
        for (
            let slice = Math.max(0, Math.floor(from / sliceWidth));
            slice < last;
            slice++
        ) {
            const level = waveformLevelDb(
                waveformBarLevel(
                    peaks,
                    slice / WAVEFORM_PRECISE_BARS_PER_BEAT,
                    (slice + 1) / WAVEFORM_PRECISE_BARS_PER_BEAT,
                ),
            );
            if (level > 0) draw(slice * sliceWidth, barWidth, level);
        }
        return;
    }
    const pitch = WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP;
    const last = Math.ceil(to / pitch);
    for (let bar = Math.max(0, Math.floor(from / pitch)); bar < last; bar++) {
        const x = bar * pitch;
        const level = waveformBarLevel(
            peaks,
            x / pixelsPerBeat,
            (x + pitch) / pixelsPerBeat,
        );
        if (level > 0) draw(x, WAVEFORM_BAR_WIDTH, level);
    }
}
