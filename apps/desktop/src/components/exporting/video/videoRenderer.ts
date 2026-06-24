import {
    AudioBufferSource,
    CanvasSource,
    getFirstEncodableAudioCodec,
    getFirstEncodableVideoCodec,
    Mp4OutputFormat,
    Output,
    OutputFormat,
    QUALITY_HIGH,
    StreamTarget,
    WebMOutputFormat,
    type AudioCodec,
    type VideoCodec,
} from "mediabunny";
import { FieldProperties } from "@openmarch/core";
import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import { SectionAppearance } from "@/db-functions";
import { type MarcherTimeline } from "@/utilities/Keyframes";
import { prepareAudioChannels, sliceAudioChannels } from "./videoExportAudio";
import Measure from "@/global/classes/Measure";
import {
    loadBrandingLogo,
    OverlayOptions,
    OverlayPlacement,
    OverlayTimeline,
} from "./videoOverlay";
import { type VideoTheme } from "./videoTheme";
import {
    createVideoRenderContext,
    DEFAULT_FIELD_FRAMING,
    type FieldFraming,
    renderVideoFrame,
} from "./videoFrameRenderer";
import type { MarcherAppearancesByPageId } from "../utils/exportAppearances";

const KEYFRAME_INTERVAL_SECONDS = 2;
const AUDIO_SLICE_SECONDS = 1;

export interface VideoExportArgs {
    fieldProperties: FieldProperties;
    marchers: Marcher[];
    /** All pages of the show, sorted by order */
    sortedPages: Page[];
    /** Full-show timelines for every marcher (keyframes for every page) */
    marcherTimelines: Map<number, MarcherTimeline>;
    sectionAppearances?: SectionAppearance[];
    marcherAppearancesByPageId?: MarcherAppearancesByPageId;
    backgroundImage?: HTMLImageElement;
    gridLines: boolean;
    halfLines: boolean;
    /** Raw bytes of the selected audio file */
    audioData: ArrayBuffer;
    /** Same offset that live playback applies (workspace setting) */
    audioOffsetSeconds: number;
    width: number;
    height: number;
    fps: number;
    /** App light/dark theme for letterbox background and overlays */
    videoTheme: VideoTheme;
    /** Pan/zoom for the field within the frame */
    fieldFraming?: FieldFraming;
    /** When set, an info HUD (set, counts, measure, etc.) is drawn on each frame */
    overlay?: {
        options: OverlayOptions;
        measures: Measure[];
        placement: OverlayPlacement;
    };
    onProgress?: (fraction: number) => void;
    isCancelled?: () => boolean;
}

export type VideoExportResult =
    | { state: "completed"; path: string }
    | { state: "cancelled" };

/**
 * Pick the best supported container/codec combination.
 * Prefers MP4 (H.264 + AAC); falls back to WebM (VP9/AV1 + Opus).
 */
async function chooseEncodingTarget(
    width: number,
    height: number,
): Promise<{
    format: OutputFormat;
    fileExtension: string;
    videoCodec: VideoCodec;
    audioCodec: AudioCodec;
}> {
    const avc = await getFirstEncodableVideoCodec(["avc"], { width, height });
    const aac = await getFirstEncodableAudioCodec(["aac"]);
    if (avc && aac) {
        return {
            format: new Mp4OutputFormat({ fastStart: "reserve" }),
            fileExtension: "mp4",
            videoCodec: avc,
            audioCodec: aac,
        };
    }

    const webmVideo = await getFirstEncodableVideoCodec(["vp9", "av1", "vp8"], {
        width,
        height,
    });
    const opus = await getFirstEncodableAudioCodec(["opus"]);
    if (webmVideo && opus) {
        return {
            format: new WebMOutputFormat(),
            fileExtension: "webm",
            videoCodec: webmVideo,
            audioCodec: opus,
        };
    }

    throw new Error("No supported video encoder is available on this system");
}

/** Decode the audio file and fit it to exactly the show duration. */
async function prepareAudio(
    audioData: ArrayBuffer,
    audioOffsetSeconds: number,
    durationSeconds: number,
): Promise<{ channels: Float32Array[][]; sampleRate: number }> {
    // OfflineAudioContext decodes without touching audio hardware and
    // resamples to the context's rate, giving a deterministic sample rate.
    const sampleRate = 44100;
    const decodeContext = new OfflineAudioContext(2, 2, sampleRate);
    const decoded = await decodeContext.decodeAudioData(audioData.slice(0));

    const channelData: Float32Array[] = [];
    for (let i = 0; i < decoded.numberOfChannels; i++) {
        channelData.push(decoded.getChannelData(i));
    }

    const prepared = prepareAudioChannels(
        channelData,
        decoded.sampleRate,
        audioOffsetSeconds,
        durationSeconds,
    );
    return {
        channels: sliceAudioChannels(
            prepared,
            decoded.sampleRate,
            AUDIO_SLICE_SECONDS,
        ),
        sampleRate: decoded.sampleRate,
    };
}

function channelsToAudioBuffer(
    slice: Float32Array[],
    sampleRate: number,
): AudioBuffer {
    const buffer = new AudioBuffer({
        numberOfChannels: slice.length,
        length: slice[0].length,
        sampleRate,
    });
    slice.forEach((data, channel) =>
        // Cast: lib.dom expects Float32Array<ArrayBuffer>, ours is ArrayBufferLike
        buffer.copyToChannel(data as never, channel),
    );
    return buffer;
}

/**
 * Render the show to a video file (animation + synced audio).
 *
 * Frames are rendered off-screen on an OpenMarchCanvas driven by the same
 * keyframe interpolation as live playback, captured with MediaBunny's
 * CanvasSource, and streamed to disk through the main process. Audio is
 * appended in one-second slices interleaved with the video frames so both
 * tracks start at timestamp 0 and stay memory-bounded.
 */
// eslint-disable-next-line max-lines-per-function
export async function exportVideo(
    args: VideoExportArgs,
): Promise<VideoExportResult> {
    const {
        fieldProperties,
        sortedPages,
        marcherTimelines,
        width,
        height,
        fps,
        fieldFraming = DEFAULT_FIELD_FRAMING,
        onProgress,
        isCancelled = () => false,
    } = args;

    if (sortedPages.length === 0)
        throw new Error("The show has no pages to export");

    const lastPage = sortedPages[sortedPages.length - 1];
    const durationSeconds = lastPage.timestamp + lastPage.duration;
    if (durationSeconds <= 0)
        throw new Error("The show has no duration to export");

    const encodingTarget = await chooseEncodingTarget(width, height);

    // Prompt for the save location before doing any expensive work
    const started = await window.electron.export.videoStart(
        encodingTarget.fileExtension,
    );
    if (!started) return { state: "cancelled" };
    const { sessionId, filePath } = started;

    const totalFrames = Math.ceil(durationSeconds * fps);
    let renderContext: Awaited<
        ReturnType<typeof createVideoRenderContext>
    > | null = null;

    try {
        const { channels: audioSlices, sampleRate } = await prepareAudio(
            args.audioData,
            args.audioOffsetSeconds,
            durationSeconds,
        );

        renderContext = await createVideoRenderContext({
            fieldProperties,
            sortedPages,
            marchers: args.marchers,
            marcherTimelines,
            sectionAppearances: args.sectionAppearances,
            marcherAppearancesByPageId: args.marcherAppearancesByPageId,
            backgroundImage: args.backgroundImage,
            gridLines: args.gridLines,
            halfLines: args.halfLines,
        });

        const frameCanvas = document.createElement("canvas");
        frameCanvas.width = width;
        frameCanvas.height = height;
        const frameContext = frameCanvas.getContext("2d");
        if (!frameContext) throw new Error("Could not create export canvas");

        const videoSource = new CanvasSource(frameCanvas, {
            codec: encodingTarget.videoCodec,
            bitrate: QUALITY_HIGH,
        });
        const audioSource = new AudioBufferSource({
            codec: encodingTarget.audioCodec,
            bitrate: QUALITY_HIGH,
        });

        const output = new Output({
            format: encodingTarget.format,
            target: new StreamTarget(
                new WritableStream({
                    async write(chunk) {
                        await window.electron.export.videoChunk(
                            sessionId,
                            chunk.data,
                            chunk.position,
                        );
                    },
                }),
                { chunked: true },
            ),
        });
        output.addVideoTrack(videoSource, {
            frameRate: fps,
            // Required by fastStart "reserve"; video packets are 1:1 to frames
            maximumPacketCount: totalFrames + 1,
        });
        output.addAudioTrack(audioSource, {
            // AAC packets hold 1024 samples, Opus 960; 1 packet per 512
            // samples is a safe upper bound for the reserved space
            maximumPacketCount:
                Math.ceil((durationSeconds * sampleRate) / 512) + 16,
        });
        await output.start();

        const overlayTimeline = args.overlay
            ? new OverlayTimeline(sortedPages, args.overlay.measures)
            : null;
        const brandingLogo = await loadBrandingLogo(args.videoTheme);

        let nextAudioSlice = 0;
        const flushAudioUntil = async (seconds: number) => {
            while (
                nextAudioSlice < audioSlices.length &&
                nextAudioSlice * AUDIO_SLICE_SECONDS <= seconds
            ) {
                await audioSource.add(
                    channelsToAudioBuffer(
                        audioSlices[nextAudioSlice],
                        sampleRate,
                    ),
                );
                nextAudioSlice++;
            }
        };

        for (let frame = 0; frame < totalFrames; frame++) {
            if (isCancelled()) {
                await output.cancel();
                await window.electron.export.videoEnd(sessionId, false);
                return { state: "cancelled" };
            }

            const timestampSeconds = frame / fps;
            await flushAudioUntil(timestampSeconds);

            renderVideoFrame({
                ctx: frameContext,
                context: renderContext,
                timeSeconds: timestampSeconds,
                durationSeconds,
                width,
                height,
                videoTheme: args.videoTheme,
                fieldFraming,
                overlayState:
                    overlayTimeline && args.overlay
                        ? overlayTimeline.getState(timestampSeconds)
                        : undefined,
                overlayOptions: args.overlay?.options,
                overlayPlacement: args.overlay?.placement,
                brandingLogo,
            });

            await videoSource.add(timestampSeconds, 1 / fps, {
                keyFrame: frame % (fps * KEYFRAME_INTERVAL_SECONDS) === 0,
            });
            onProgress?.((frame + 1) / totalFrames);
        }

        await flushAudioUntil(Infinity);
        await output.finalize();

        const finalPath = await window.electron.export.videoEnd(
            sessionId,
            true,
        );
        return { state: "completed", path: finalPath ?? filePath };
    } catch (error) {
        await window.electron.export
            .videoEnd(sessionId, false)
            .catch(() => undefined);
        throw error;
    } finally {
        renderContext?.dispose();
    }
}
