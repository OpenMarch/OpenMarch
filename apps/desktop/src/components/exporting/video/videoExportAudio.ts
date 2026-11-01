/**
 * Pure helpers for preparing audio for video export.
 *
 * The exported video's audio track must line up exactly with the show
 * timeline: the same user-configured offset that live playback applies
 * (see audioOffset.worker.ts) is applied here, and the result is trimmed or
 * padded with silence to exactly the show duration so that audio timestamp 0
 * equals video timestamp 0 and both tracks end together.
 */

/**
 * Apply the audio offset and fit the audio to an exact duration.
 *
 * @param channelData - One Float32Array of samples per channel
 * @param sampleRate - Sample rate of the audio in hertz
 * @param offsetSeconds - Positive pads silence at the start, negative trims
 *   from the start (same semantics as live playback)
 * @param durationSeconds - Exact duration the output must have; audio longer
 *   than this is trimmed, shorter audio is padded with trailing silence
 * @returns One Float32Array per channel, each exactly
 *   `round(durationSeconds * sampleRate)` samples long
 */
export function prepareAudioChannels(
    channelData: Float32Array[],
    sampleRate: number,
    offsetSeconds: number,
    durationSeconds: number,
): Float32Array[] {
    const targetLength = Math.round(durationSeconds * sampleRate);
    const offsetSamples = Math.floor(Math.abs(offsetSeconds) * sampleRate);

    return channelData.map((data) => {
        const output = new Float32Array(targetLength);
        // Where the source audio starts in the output (offset applied)
        const source = offsetSeconds < 0 ? data.subarray(offsetSamples) : data;
        const destinationStart = offsetSeconds > 0 ? offsetSamples : 0;
        const copyLength = Math.min(
            source.length,
            Math.max(0, targetLength - destinationStart),
        );
        output.set(source.subarray(0, copyLength), destinationStart);
        return output;
    });
}

/**
 * Split channel data into consecutive slices for interleaved encoding.
 *
 * Slicing lets the encoder receive audio in ~1 second chunks between batches
 * of video frames, keeping MediaBunny's packet buffering memory-bounded.
 *
 * @param channelData - One Float32Array of samples per channel
 * @param sampleRate - Sample rate of the audio in hertz
 * @param sliceSeconds - Length of each slice in seconds
 * @returns An array of slices; each slice is one Float32Array view per channel
 */
export function sliceAudioChannels(
    channelData: Float32Array[],
    sampleRate: number,
    sliceSeconds = 1,
): Float32Array[][] {
    const totalLength = channelData[0]?.length ?? 0;
    const sliceLength = Math.max(1, Math.round(sliceSeconds * sampleRate));
    const slices: Float32Array[][] = [];

    for (let start = 0; start < totalLength; start += sliceLength) {
        const end = Math.min(start + sliceLength, totalLength);
        slices.push(channelData.map((data) => data.subarray(start, end)));
    }
    return slices;
}

/**
 * The audio of an export as consecutive slices made on demand, so only the
 * decoded audio and one slice are in memory (not a second full copy). Each
 * slice equals the same slice of
 * `sliceAudioChannels(prepareAudioChannels(...))`.
 */
export interface AudioSlices {
    count: number;
    slice: (index: number) => Float32Array[];
}

export function lazyAudioSlices(
    channelData: Float32Array[],
    sampleRate: number,
    offsetSeconds: number,
    durationSeconds: number,
    sliceSeconds = 1,
): AudioSlices {
    const targetLength = Math.round(durationSeconds * sampleRate);
    const offsetSamples = Math.floor(Math.abs(offsetSeconds) * sampleRate);
    const sourceStart = offsetSeconds < 0 ? offsetSamples : 0;
    const destinationStart = offsetSeconds > 0 ? offsetSamples : 0;
    const sliceLength = Math.max(1, Math.round(sliceSeconds * sampleRate));
    const count =
        channelData.length === 0 ? 0 : Math.ceil(targetLength / sliceLength);

    return {
        count,
        slice(index) {
            const start = index * sliceLength;
            const end = Math.min(start + sliceLength, targetLength);
            return channelData.map((data) => {
                const output = new Float32Array(Math.max(0, end - start));
                // Output positions [from, to) that hold source audio
                const sourceEndInOutput =
                    destinationStart + Math.max(0, data.length - sourceStart);
                const from = Math.max(start, destinationStart);
                const to = Math.min(end, sourceEndInOutput);
                if (to > from) {
                    const sourceFrom = from - destinationStart + sourceStart;
                    output.set(
                        data.subarray(sourceFrom, sourceFrom + (to - from)),
                        from - start,
                    );
                }
                return output;
            });
        },
    };
}
