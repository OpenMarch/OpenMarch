import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldProperties } from "@openmarch/core";
import { exportVideo } from "../videoRenderer";

/**
 * These flags let each test simulate a `VideoEncoder` that fails during
 * actual encoding despite passing mediabunny's codec support check - the
 * class of bug seen on some AMD/Windows GPU drivers. `add()` throws
 * asynchronously, the same way mediabunny surfaces a WebCodecs encoder's
 * out-of-band `error` callback (see media-source.js: encoder errors are
 * stashed and re-thrown on the next call).
 */
let hardwareEncodeShouldFail = false;
let softwareEncodeShouldFailToo = false;
const canvasSourceConfigs: Array<{ hardwareAcceleration?: string }> = [];

vi.mock("mediabunny", () => {
    class CanvasSource {
        config: { hardwareAcceleration?: string };
        constructor(
            _canvas: unknown,
            config: { hardwareAcceleration?: string },
        ) {
            this.config = config;
            canvasSourceConfigs.push(config);
        }
        async add() {
            const isSoftware =
                this.config.hardwareAcceleration === "prefer-software";
            if (
                softwareEncodeShouldFailToo ||
                (hardwareEncodeShouldFail && !isSoftware)
            ) {
                throw new Error(
                    isSoftware
                        ? "simulated software encoder failure"
                        : "simulated hardware encoder failure",
                );
            }
        }
    }
    class AudioBufferSource {
        async add() {}
    }
    class Output {
        async start() {}
        addVideoTrack() {}
        addAudioTrack() {}
        async finalize() {}
        async cancel() {}
    }
    class StreamTarget {}
    class Mp4OutputFormat {}
    class WebMOutputFormat {}
    return {
        CanvasSource,
        AudioBufferSource,
        Output,
        StreamTarget,
        Mp4OutputFormat,
        WebMOutputFormat,
        QUALITY_HIGH: "high",
        getFirstEncodableVideoCodec: vi.fn(async () => "avc"),
        getFirstEncodableAudioCodec: vi.fn(async () => "aac"),
    };
});

vi.mock("../videoFrameRenderer", () => ({
    DEFAULT_FIELD_FRAMING: { scale: 1, offsetX: 0, offsetY: 0 },
    createVideoRenderContext: vi.fn(async () => ({ dispose: vi.fn() })),
    renderVideoFrame: vi.fn(() => null),
}));

vi.mock("../videoOverlay", () => ({
    loadBrandingLogo: vi.fn(async () => null),
    OverlayTimeline: class {
        getState() {
            return {};
        }
    },
}));

vi.mock("../videoExportAudio", () => ({
    prepareAudioChannels: vi.fn((channels: unknown) => channels),
    sliceAudioChannels: vi.fn(() => []),
}));

// jsdom doesn't implement the Web Audio API; exportVideo only needs
// decodeAudioData() to resolve to something with the shape it reads from.
class FakeOfflineAudioContext {
    async decodeAudioData() {
        return {
            numberOfChannels: 0,
            sampleRate: 44100,
            getChannelData: () => new Float32Array(),
        };
    }
}
// @ts-expect-error - test stub, not a full OfflineAudioContext
global.OfflineAudioContext = FakeOfflineAudioContext;

// jsdom doesn't implement canvas rendering; renderVideoFrame is mocked above
// and never touches this, it just needs to be a truthy object.
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as unknown as CanvasRenderingContext2D,
);

const minimalExportArgs = {
    fieldProperties: { width: 1600, height: 900 } as FieldProperties,
    marchers: [],
    sortedPages: [],
    marcherTimelines: new Map(),
    gridLines: false,
    halfLines: false,
    audioData: new ArrayBuffer(0),
    audioOffsetSeconds: 0,
    width: 1920,
    height: 1080,
    fps: 30,
    videoTheme: "light" as const,
};

// A single short page so the frame loop only needs to run a couple of times.
const exportArgsWithPages = {
    ...minimalExportArgs,
    sortedPages: [{ timestamp: 0, duration: 0.1 } as never],
};

describe("exportVideo", () => {
    beforeEach(() => {
        hardwareEncodeShouldFail = false;
        softwareEncodeShouldFailToo = false;
        canvasSourceConfigs.length = 0;

        const videoStart = vi.fn(
            async (_fileExtension: string, existingFilePath?: string) => ({
                sessionId: existingFilePath ? "session-retry" : "session-1",
                filePath: existingFilePath ?? "/tmp/out.mp4",
            }),
        );
        const videoChunk = vi.fn(async () => undefined);
        const videoEnd = vi.fn(async (_sessionId: string, success: boolean) =>
            success ? "/tmp/out.mp4" : null,
        );

        window.electron = {
            export: { videoStart, videoChunk, videoEnd },
        } as unknown as typeof window.electron;
    });

    it("throws when sortedPages is empty", async () => {
        await expect(exportVideo(minimalExportArgs)).rejects.toThrow(
            "The show has no pages to export",
        );
    });

    it("encodes with hardware acceleration on the first attempt when it succeeds", async () => {
        const result = await exportVideo(exportArgsWithPages);

        expect(result).toEqual({ state: "completed", path: "/tmp/out.mp4" });
        expect(window.electron.export.videoStart).toHaveBeenCalledTimes(1);
        expect(canvasSourceConfigs).toHaveLength(1);
        expect(canvasSourceConfigs[0].hardwareAcceleration).toBe(
            "no-preference",
        );
    });

    it("falls back to software encoding and reuses the save path when hardware encoding fails", async () => {
        hardwareEncodeShouldFail = true;
        const onRetryWithSoftwareEncoding = vi.fn();

        const result = await exportVideo({
            ...exportArgsWithPages,
            onRetryWithSoftwareEncoding,
        });

        expect(result).toEqual({ state: "completed", path: "/tmp/out.mp4" });
        expect(onRetryWithSoftwareEncoding).toHaveBeenCalledTimes(1);

        // No second save dialog: the retry reuses the first attempt's path.
        expect(window.electron.export.videoStart).toHaveBeenCalledTimes(2);
        expect(window.electron.export.videoStart).toHaveBeenNthCalledWith(
            1,
            "mp4",
        );
        expect(window.electron.export.videoStart).toHaveBeenNthCalledWith(
            2,
            "mp4",
            "/tmp/out.mp4",
        );

        expect(canvasSourceConfigs.map((c) => c.hardwareAcceleration)).toEqual([
            "no-preference",
            "prefer-software",
        ]);

        // The failed hardware session is cleaned up before the retry starts.
        expect(window.electron.export.videoEnd).toHaveBeenCalledWith(
            "session-1",
            false,
        );
        expect(window.electron.export.videoEnd).toHaveBeenCalledWith(
            "session-retry",
            true,
        );
    });

    it("skips straight to software encoding when forceSoftwareEncoding is set", async () => {
        const result = await exportVideo({
            ...exportArgsWithPages,
            forceSoftwareEncoding: true,
        });

        expect(result).toEqual({ state: "completed", path: "/tmp/out.mp4" });
        expect(window.electron.export.videoStart).toHaveBeenCalledTimes(1);
        expect(canvasSourceConfigs).toHaveLength(1);
        expect(canvasSourceConfigs[0].hardwareAcceleration).toBe(
            "prefer-software",
        );
    });

    it("surfaces a combined error when both hardware and software attempts fail", async () => {
        hardwareEncodeShouldFail = true;
        softwareEncodeShouldFailToo = true;

        await expect(exportVideo(exportArgsWithPages)).rejects.toThrow(
            /Hardware-accelerated encoding failed.*software encoding fallback also failed/s,
        );

        // Both the failed hardware session and the failed retry session get
        // cleaned up.
        expect(window.electron.export.videoEnd).toHaveBeenCalledWith(
            "session-1",
            false,
        );
        expect(window.electron.export.videoEnd).toHaveBeenCalledWith(
            "session-retry",
            false,
        );
    });
});
