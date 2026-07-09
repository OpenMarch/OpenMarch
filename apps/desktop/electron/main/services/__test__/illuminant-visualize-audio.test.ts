import { describe, expect, it } from "vitest";
import {
    audioFileToBuffer,
    buildTempAudioPath,
    enrichIlluminantVisualizerRequestWithAudio,
    shouldIncludeAudioInVisualizerRequest,
} from "../illuminant-visualize-audio";

describe("illuminant-visualize-audio", () => {
    it("includes audio when a real file with data is present", () => {
        expect(
            shouldIncludeAudioInVisualizerRequest({
                id: 1,
                path: "/music/show.mp3",
                data: Buffer.from("audio"),
            }),
        ).toBe(true);
    });

    it("skips the silent placeholder and empty audio", () => {
        expect(
            shouldIncludeAudioInVisualizerRequest({
                id: -1,
                path: "silent-audio.wav",
                data: Buffer.from("audio"),
            }),
        ).toBe(false);
        expect(
            shouldIncludeAudioInVisualizerRequest({
                id: 2,
                path: "/music/show.mp3",
            }),
        ).toBe(false);
        expect(
            shouldIncludeAudioInVisualizerRequest({
                id: 2,
                path: "/music/show.mp3",
                data: new Uint8Array(),
            }),
        ).toBe(false);
        expect(shouldIncludeAudioInVisualizerRequest(null)).toBe(false);
    });

    it("enriches the visualize request with audio fields", () => {
        const request = {
            filename: "preview.mp4",
            showData: {},
            lightingData: {},
        };

        expect(
            enrichIlluminantVisualizerRequestWithAudio(
                request,
                "/tmp/show.mp3",
                { audioOffsetSeconds: 1.5 },
            ),
        ).toEqual({
            ...request,
            audioPath: "/tmp/show.mp3",
            audioOffsetSeconds: 1.5,
        });
    });

    it("preserves audio bytes when converting buffers", () => {
        const bytes = Uint8Array.from([1, 2, 3]);
        expect(audioFileToBuffer(bytes)).toEqual(Buffer.from(bytes));
        expect(audioFileToBuffer(bytes.buffer)).toEqual(Buffer.from(bytes));
        expect(audioFileToBuffer(Buffer.from(bytes))).toEqual(
            Buffer.from(bytes),
        );
    });

    it("uses the source extension when building a temp audio path", () => {
        const tempPath = buildTempAudioPath(
            "/Users/me/Music/show track.mp3",
            "/tmp",
        );
        expect(tempPath.startsWith("/tmp/illuminant-audio-")).toBe(true);
        expect(tempPath.endsWith(".mp3")).toBe(true);
    });
});
