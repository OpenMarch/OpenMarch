import {
    applyFade,
    generateOscillator,
    mixSamples,
    padSamples,
} from "./tone_creator";
import { memoize } from "./utils";

export const FADE_DURATION = 0.05; // seconds

/**
 * Generates a default beat and measure click sound.
 */
const _beatClickDefault = (): Float32Array => {
    const s1 = generateOscillator("sawtooth", 2600, 0.04, 0.1);
    const s2 = generateOscillator("triangle", 2600, 0.04, 0.3);
    const s3 = generateOscillator("sine", 2600, 0.07, 0.8);

    const maxLen = Math.max(s1.length, s2.length, s3.length);
    return applyFade(
        mixSamples([
            padSamples(s1, maxLen),
            padSamples(s2, maxLen),
            padSamples(s3, maxLen),
        ]),
        FADE_DURATION,
    );
};
const _measureClickDefault = (): Float32Array => {
    const s1 = generateOscillator("sawtooth", 3000, 0.04, 0.1);
    const s2 = generateOscillator("triangle", 3000, 0.04, 0.3);
    const s3 = generateOscillator("sine", 3000, 0.07, 0.8);

    const maxLen = Math.max(s1.length, s2.length, s3.length);
    return applyFade(
        mixSamples([
            padSamples(s1, maxLen),
            padSamples(s2, maxLen),
            padSamples(s3, maxLen),
        ]),
        FADE_DURATION,
    );
};

/**
 * Generates sharp beat and measure click sounds.
 */
const _sharpBeatClick = (): Float32Array => {
    const s1 = generateOscillator("sawtooth", 3200, 0.02, 0.15);
    const s2 = generateOscillator("triangle", 3200, 0.05, 0.4);

    const maxLen = Math.max(s1.length, s2.length);
    return applyFade(
        mixSamples([padSamples(s1, maxLen), padSamples(s2, maxLen)]),
        FADE_DURATION,
    );
};
const _sharpMeasureClick = (): Float32Array => {
    const s1 = generateOscillator("sawtooth", 3500, 0.02, 0.15);
    const s2 = generateOscillator("triangle", 3500, 0.05, 0.4);

    const maxLen = Math.max(s1.length, s2.length);
    return applyFade(
        mixSamples([padSamples(s1, maxLen), padSamples(s2, maxLen)]),
        FADE_DURATION,
    );
};

/**
 * Generates smooth beat and measure click sounds.
 */
const _smoothBeatClick = (): Float32Array => {
    return applyFade(generateOscillator("sine", 2000, 0.1, 1), FADE_DURATION);
};
const _smoothMeasureClick = (volume = 1): Float32Array => {
    return applyFade(generateOscillator("sine", 2400, 0.1, 1), FADE_DURATION);
};

/**
 * Memoized functions for generating click sounds.
 */
export const beatClickDefault = memoize(_beatClickDefault);
export const measureClickDefault = memoize(_measureClickDefault);
export const sharpBeatClick = memoize(_sharpBeatClick);
export const sharpMeasureClick = memoize(_sharpMeasureClick);
export const smoothBeatClick = memoize(_smoothBeatClick);
export const smoothMeasureClick = memoize(_smoothMeasureClick);

/**
 * Exposed mapping of beat styles to click sounds.
 */
export type BeatStyleId = "default" | "sharp" | "smooth";
export const BEAT_STYLE_IDS: BeatStyleId[] = ["default", "sharp", "smooth"];
export const BEAT_STYLE_FUNCTIONS: Record<
    BeatStyleId,
    { beat: () => Float32Array; measure: () => Float32Array }
> = {
    default: { beat: beatClickDefault, measure: measureClickDefault },
    sharp: { beat: sharpBeatClick, measure: sharpMeasureClick },
    smooth: { beat: smoothBeatClick, measure: smoothMeasureClick },
};
