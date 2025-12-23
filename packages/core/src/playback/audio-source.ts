/**
 * Platform-agnostic audio source for the PlaybackClock.
 */
export default interface IAudioSource {
    /**
     * Get current playback position in milliseconds.
     * Returns null if audio isn't loaded/ready.
     */
    getCurrentTimeMs(): number | null;

    /**
     * Start or resume playback.
     * @param startTimeMs - Optional timestamp to start from
     */
    play(startTimeMs?: number): Promise<void>;

    /**
     * Pause playback.
     */
    pause(): Promise<void>;

    /**
     * Seek to a specific timestamp.
     * @param timestampMs - Time to seek to in milliseconds
     */
    seek(timestampMs: number): Promise<void>;

    /**
     * Set playback speed.
     * @param rate - Playback rate (1.0 = normal, 0.5 = half speed, 2.0 = double speed)
     */
    setPlaybackRate(rate: number): Promise<void>;

    /**
     * Get the total duration of the audio in milliseconds.
     * Returns null if unknown or not loaded.
     */
    getDurationMs(): number | null;

    /**
     * Clean up resources.
     */
    dispose(): Promise<void>;
}
