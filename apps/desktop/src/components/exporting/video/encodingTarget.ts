/**
 * Picks the container and codecs for a video export.
 *
 * The desktop app (Electron) keeps its original rule: MP4 (H.264 + AAC),
 * else WebM (VP9/AV1/VP8 + Opus), else fail.
 *
 * The web editor prefers MP4 everywhere, because it is the only format an
 * iPad saves to Photos and plays everywhere. Safari before 26 encodes H.264
 * video (WebCodecs `VideoEncoder`, Safari 16.4+) but has no `AudioEncoder`
 * at all (Safari 26+), so there the AAC track comes from a WebAssembly
 * build of FFmpeg's AAC encoder (`@mediabunny/aac-encoder`), loaded only
 * when the browser can't encode AAC itself. If even that fails (for example
 * WebAssembly is off, as in the iPad high-security mode), the video is exported
 * without sound and the dialog says so before starting.
 */
import {
    getFirstEncodableAudioCodec,
    getFirstEncodableVideoCodec,
    Mp4OutputFormat,
    WebMOutputFormat,
    type AudioCodec,
    type OutputFormat,
    type VideoCodec,
} from "mediabunny";

export interface EncodingTarget {
    format: OutputFormat;
    fileExtension: "mp4" | "webm";
    videoCodec: VideoCodec;
    /** Null: the video has no sound track (see `audio`). */
    audioCodec: AudioCodec | null;
    /**
     * Where the sound comes from: the browser's own encoder, the bundled
     * WebAssembly AAC encoder, or nowhere (silent video).
     */
    audio: "native" | "wasm" | "none";
}

/** The codec probes, injectable for tests. Defaults to mediabunny's. */
export interface EncodingProbes {
    firstVideoCodec: (
        codecs: VideoCodec[],
        size: { width: number; height: number },
    ) => Promise<VideoCodec | null>;
    firstAudioCodec: (codecs: AudioCodec[]) => Promise<AudioCodec | null>;
    /**
     * Registers the WebAssembly AAC encoder with mediabunny. True when it
     * did (afterwards `firstAudioCodec(["aac"])` finds it).
     */
    loadAacFallback: () => Promise<boolean>;
}

export interface ChooseEncodingOptions {
    /**
     * Web rules: MP4 first (with the WebAssembly AAC encoder when needed),
     * and a silent video rather than none. Off in Electron.
     */
    web?: boolean;
    probes?: Partial<EncodingProbes>;
}

let aacFallback: Promise<boolean> | null = null;

/** Loads and registers `@mediabunny/aac-encoder` once (about 1 MB). */
export function loadAacFallback(): Promise<boolean> {
    aacFallback ??= (async () => {
        try {
            if (typeof WebAssembly === "undefined") return false;
            const { registerAacEncoder } =
                await import("@mediabunny/aac-encoder");
            registerAacEncoder();
            return true;
        } catch (error) {
            console.warn("Couldn't load the AAC encoder:", error);
            aacFallback = null;
            return false;
        }
    })();
    return aacFallback;
}

const defaultProbes: EncodingProbes = {
    firstVideoCodec: (codecs, size) =>
        getFirstEncodableVideoCodec(codecs, size),
    firstAudioCodec: (codecs) => getFirstEncodableAudioCodec(codecs),
    loadAacFallback,
};

const mp4 = () => new Mp4OutputFormat({ fastStart: "reserve" });
const webm = () => new WebMOutputFormat();
const WEBM_VIDEO_CODECS: VideoCodec[] = ["vp9", "av1", "vp8"];

/**
 * Picks the best supported container/codec combination for this browser.
 * Throws when no video encoder is available at all.
 */
export async function chooseEncodingTarget(
    width: number,
    height: number,
    { web = false, probes = {} }: ChooseEncodingOptions = {},
): Promise<EncodingTarget> {
    const probe = { ...defaultProbes, ...probes };
    const size = { width, height };

    const avc = await probe.firstVideoCodec(["avc"], size);
    let aac = await probe.firstAudioCodec(["aac"]);
    if (avc && aac)
        return {
            format: mp4(),
            fileExtension: "mp4",
            videoCodec: avc,
            audioCodec: aac,
            audio: "native",
        };

    if (web && avc && (await probe.loadAacFallback())) {
        aac = await probe.firstAudioCodec(["aac"]);
        if (aac)
            return {
                format: mp4(),
                fileExtension: "mp4",
                videoCodec: avc,
                audioCodec: aac,
                audio: "wasm",
            };
    }

    const webmVideo = await probe.firstVideoCodec(WEBM_VIDEO_CODECS, size);
    const opus = await probe.firstAudioCodec(["opus"]);
    if (webmVideo && opus)
        return {
            format: webm(),
            fileExtension: "webm",
            videoCodec: webmVideo,
            audioCodec: opus,
            audio: "native",
        };

    if (web && (avc || webmVideo))
        return {
            format: avc ? mp4() : webm(),
            fileExtension: avc ? "mp4" : "webm",
            videoCodec: (avc ?? webmVideo)!,
            audioCodec: null,
            audio: "none",
        };

    throw new Error("No supported video encoder is available on this system");
}
