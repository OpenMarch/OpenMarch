// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AudioCodec, VideoCodec } from "mediabunny";
import { chooseEncodingTarget, type EncodingProbes } from "../encodingTarget";

/** A browser that can encode `video` and `audio` (plus AAC once loaded). */
function browser({
    video,
    audio,
    wasmLoads = true,
}: {
    video: VideoCodec[];
    audio: AudioCodec[];
    wasmLoads?: boolean;
}) {
    const audioCodecs = [...audio];
    const loadAacFallback = vi.fn(async () => {
        if (wasmLoads) audioCodecs.push("aac");
        return wasmLoads;
    });
    const probes: EncodingProbes = {
        firstVideoCodec: async (codecs) =>
            codecs.find((c) => video.includes(c)) ?? null,
        firstAudioCodec: async (codecs) =>
            codecs.find((c) => audioCodecs.includes(c)) ?? null,
        loadAacFallback,
    };
    return { probes, loadAacFallback };
}

const CHROME_MAC = { video: ["avc", "vp9"], audio: ["aac", "opus"] } as const;
const CHROME_LINUX = { video: ["avc", "vp9"], audio: ["opus"] } as const;
/** Safari 16.4–18: VideoEncoder (H.264, no VP9 encode), no AudioEncoder. */
const SAFARI_17 = { video: ["avc"], audio: [] } as const;
/** Safari 26+: AudioEncoder with AAC. */
const SAFARI_26 = { video: ["avc"], audio: ["aac"] } as const;

const pick = (
    kind: { video: readonly VideoCodec[]; audio: readonly AudioCodec[] },
    web: boolean,
    wasmLoads = true,
) => {
    const b = browser({
        video: [...kind.video],
        audio: [...kind.audio],
        wasmLoads,
    });
    return {
        result: chooseEncodingTarget(1280, 720, { web, probes: b.probes }),
        loadAacFallback: b.loadAacFallback,
    };
};

describe("chooseEncodingTarget in the desktop app", () => {
    it("uses MP4 with H.264 and AAC when both are available", async () => {
        const target = await pick(CHROME_MAC, false).result;
        expect(target).toMatchObject({
            fileExtension: "mp4",
            videoCodec: "avc",
            audioCodec: "aac",
            audio: "native",
        });
    });

    it("falls back to WebM with Opus without AAC, and never loads the WebAssembly encoder", async () => {
        const { result, loadAacFallback } = pick(CHROME_LINUX, false);
        expect(await result).toMatchObject({
            fileExtension: "webm",
            videoCodec: "vp9",
            audioCodec: "opus",
        });
        expect(loadAacFallback).not.toHaveBeenCalled();
    });

    it("still fails without any audio encoder (unchanged rule)", async () => {
        await expect(pick(SAFARI_17, false).result).rejects.toThrow(
            "No supported video encoder",
        );
    });
});

describe("chooseEncodingTarget in the web editor", () => {
    it("Safari 17: H.264 video with the WebAssembly AAC encoder, in MP4", async () => {
        const { result, loadAacFallback } = pick(SAFARI_17, true);
        expect(await result).toMatchObject({
            fileExtension: "mp4",
            videoCodec: "avc",
            audioCodec: "aac",
            audio: "wasm",
        });
        expect(loadAacFallback).toHaveBeenCalledOnce();
    });

    it("Safari 26: the browser's own AAC, nothing loaded", async () => {
        const { result, loadAacFallback } = pick(SAFARI_26, true);
        expect(await result).toMatchObject({ audio: "native" });
        expect(loadAacFallback).not.toHaveBeenCalled();
    });

    it("prefers MP4 with WebAssembly AAC over WebM where AAC is missing", async () => {
        expect(await pick(CHROME_LINUX, true).result).toMatchObject({
            fileExtension: "mp4",
            audio: "wasm",
        });
    });

    it("uses WebM with Opus when the WebAssembly encoder can't load", async () => {
        expect(await pick(CHROME_LINUX, true, false).result).toMatchObject({
            fileExtension: "webm",
            audioCodec: "opus",
        });
    });

    it("exports a silent MP4 when no audio encoder works at all", async () => {
        expect(await pick(SAFARI_17, true, false).result).toMatchObject({
            fileExtension: "mp4",
            videoCodec: "avc",
            audioCodec: null,
            audio: "none",
        });
    });

    it("exports a silent WebM when only WebM video can be encoded", async () => {
        expect(
            await pick({ video: ["vp8"], audio: [] }, true, false).result,
        ).toMatchObject({ fileExtension: "webm", audio: "none" });
    });

    it("fails when no video encoder exists", async () => {
        await expect(
            pick({ video: [], audio: ["aac"] }, true).result,
        ).rejects.toThrow("No supported video encoder");
    });
});
