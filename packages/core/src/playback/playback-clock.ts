import type IAudioSource from "./audio-source";

export default class PlaybackClock {
    private audioSource?: IAudioSource;

    // For performance.now() fallback
    private startTimeMs: number = 0;
    private pausedAtMs: number = 0;
    private isPlaying: boolean = false;
    private playbackRate: number = 1.0;
    private performanceStartTime: number = 0;

    constructor(audioSource?: IAudioSource) {
        this.audioSource = audioSource;
    }

    /**
     * Get the current timestamp in milliseconds.
     */
    public getCurrentTime(): number {
        if (!this.isPlaying) {
            return this.pausedAtMs;
        }

        // Try audio first (most accurate)
        if (this.audioSource) {
            const audioTime = this.audioSource.getCurrentTimeMs();
            if (audioTime !== null) {
                return audioTime;
            }
        }

        // Fallback to performance timer
        const elapsedMs =
            (performance.now() - this.performanceStartTime) * this.playbackRate;
        return this.startTimeMs + elapsedMs;
    }

    public async play(startFromMs?: number): Promise<void> {
        const startTime = startFromMs ?? this.pausedAtMs;

        if (this.audioSource) {
            await this.audioSource.play(startTime);
        } else {
            // No audio - use performance timer
            this.startTimeMs = startTime;
            this.performanceStartTime = performance.now();
        }

        this.isPlaying = true;
    }

    public async pause(): Promise<void> {
        this.pausedAtMs = this.getCurrentTime();
        this.isPlaying = false;

        if (this.audioSource) {
            await this.audioSource.pause();
        }
    }

    public async seek(timestampMs: number): Promise<void> {
        const wasPlaying = this.isPlaying;

        if (wasPlaying) {
            await this.pause();
        }

        this.pausedAtMs = timestampMs;

        if (this.audioSource) {
            await this.audioSource.seek(timestampMs);
        }

        if (wasPlaying) {
            await this.play(timestampMs);
        }
    }

    public async setPlaybackRate(rate: number): Promise<void> {
        const currentTime = this.getCurrentTime();
        this.playbackRate = rate;

        if (this.audioSource) {
            await this.audioSource.setPlaybackRate(rate);
        } else if (this.isPlaying) {
            // Restart the performance timer with new rate
            this.startTimeMs = currentTime;
            this.performanceStartTime = performance.now();
        }
    }

    public setAudioSource(audioSource: IAudioSource | undefined): void {
        this.audioSource = audioSource;
    }

    public async dispose(): Promise<void> {
        if (this.audioSource) {
            await this.audioSource.dispose();
        }
    }
}
