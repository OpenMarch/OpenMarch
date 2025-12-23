import type CoordinateManager from "./coordinate-manager";
import type PlaybackClock from "./playback-clock";

/**
 * Orchestrates playback - owns the animation loop and ties everything together.
 */
export default class PlaybackController {
    private frameHandle?: number | NodeJS.Timeout;
    private renderers: IRenderer[] = [];

    constructor(
        private clock: PlaybackClock,
        private coordinateManager: CoordinateManager,
        private frameScheduler: IFrameScheduler,
    ) {}

    /**
     * Register a renderer to receive coordinate updates.
     */
    public addRenderer(renderer: IRenderer): void {
        this.renderers.push(renderer);
    }

    public removeRenderer(renderer: IRenderer): void {
        this.renderers = this.renderers.filter((r) => r !== renderer);
    }

    public start(): void {
        if (this.frameHandle) return; // Already running

        const loop = () => {
            // 1. Get current time
            const timestamp = this.clock.getCurrentTime();

            // 2. Calculate coordinates
            const coordinates =
                this.coordinateManager.getCoordinates(timestamp);

            // 3. Push to all renderers
            this.renderers.forEach((renderer) => {
                renderer.render(coordinates, timestamp);
            });

            // 4. Schedule next frame
            this.frameHandle = this.frameScheduler.requestFrame(loop);
        };

        this.frameHandle = this.frameScheduler.requestFrame(loop);
    }

    public stop(): void {
        if (this.frameHandle) {
            this.frameScheduler.cancelFrame(this.frameHandle);
            this.frameHandle = undefined;
        }
    }

    // Delegate playback controls to the clock
    public async play(startFromMs?: number): Promise<void> {
        await this.clock.play(startFromMs);
        this.start();
    }

    public async pause(): Promise<void> {
        await this.clock.pause();
        this.stop();
    }

    public async seek(timestampMs: number): Promise<void> {
        await this.clock.seek(timestampMs);
        // Render one frame at the new position
        const coords = this.coordinateManager.getCoordinates(timestampMs);
        this.renderers.forEach((r) => r.render(coords, timestampMs));
    }
}

/**
 * Anything that can render marcher coordinates.
 */
export interface IRenderer {
    render(
        coordinates: Record<string, { x: number; y: number }>,
        timestamp: number,
    ): void;
}

/**
 * Platform-agnostic frame scheduling for animation loops.
 */
export interface IFrameScheduler {
    /**
     * Request the callback to be called on the next frame.
     * @returns A handle that can be used to cancel the request
     */
    requestFrame(callback: () => void): number | NodeJS.Timeout;

    /**
     * Cancel a previously requested frame.
     */
    cancelFrame(handle: number | NodeJS.Timeout): void;
}
