/** What the audio player sends the time-stretch worklet (`timeStretch.worklet.ts`) */
export type StretchMessage =
    /** The offset music, one array per channel */
    | { type: "music"; channels: Float32Array[] }
    /** The click track and its clicks' show times in seconds, ascending */
    | { type: "metronome"; track: Float32Array; onsets: Float64Array }
    /** Plays from show second `from` at context time `at` */
    | { type: "play"; at: number; from: number; rate: number }
    /** Changes speed at context time `at`, keeping the show's position */
    | { type: "rate"; at: number; rate: number }
    | { type: "stop"; at: number }
    /** The node is gone: the processor ends and lets go of the music */
    | { type: "dispose" };

export const TIME_STRETCH_PROCESSOR = "om-time-stretch";
