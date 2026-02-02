import { describe, expect, it, vi } from "vitest";
import {
    SILENT_AUDIO_PATH,
    isSilentPlaceholder,
    findServerAudioFileIdByChecksum,
    prepareAudioSyncResult,
    buildAudioUploadFormData,
    type LocalAudioFileForSync,
    type ServerAudioFileWithChecksum,
} from "../audioSyncOnUpload";

describe("audioSyncOnUpload", () => {
    describe("isSilentPlaceholder", () => {
        it("returns true for silent-audio.wav path", () => {
            expect(isSilentPlaceholder(SILENT_AUDIO_PATH, 1)).toBe(true);
        });

        it("returns true for id -1", () => {
            expect(isSilentPlaceholder("/any/path.mp3", -1)).toBe(true);
        });

        it("returns true when both path and id match", () => {
            expect(isSilentPlaceholder(SILENT_AUDIO_PATH, -1)).toBe(true);
        });

        it("returns false for real file path and positive id", () => {
            expect(isSilentPlaceholder("/music/show.mp3", 1)).toBe(false);
        });

        it("returns false for path that only contains silent-audio in name", () => {
            expect(
                isSilentPlaceholder("/folder/silent-audio.wav/other", 1),
            ).toBe(false);
        });
    });

    describe("findServerAudioFileIdByChecksum", () => {
        const serverFiles: ServerAudioFileWithChecksum[] = [
            { id: 10, checksum: "aaa" },
            { id: 20, checksum: "bbb" },
            { id: 30, checksum: "ccc" },
        ];

        it("returns id when checksum matches", () => {
            expect(findServerAudioFileIdByChecksum("bbb", serverFiles)).toBe(
                20,
            );
        });

        it("returns null when no checksum matches", () => {
            expect(findServerAudioFileIdByChecksum("xyz", serverFiles)).toBe(
                null,
            );
        });

        it("returns null for empty server list", () => {
            expect(findServerAudioFileIdByChecksum("aaa", [])).toBe(null);
        });

        it("handles server files without checksum", () => {
            const withMissing = [
                { id: 1, checksum: "abc" },
                { id: 2 },
            ] as ServerAudioFileWithChecksum[];
            expect(findServerAudioFileIdByChecksum("abc", withMissing)).toBe(1);
            expect(
                findServerAudioFileIdByChecksum("undefined", withMissing),
            ).toBe(null);
        });
    });

    describe("prepareAudioSyncResult", () => {
        const mockComputeChecksum = vi.fn();

        beforeEach(() => {
            mockComputeChecksum.mockClear();
        });

        it("returns null for silent placeholder", async () => {
            const file: LocalAudioFileForSync = {
                id: -1,
                path: SILENT_AUDIO_PATH,
                data: new ArrayBuffer(8),
            };
            const result = await prepareAudioSyncResult(
                file,
                [{ id: 1, checksum: "x" }],
                mockComputeChecksum,
            );
            expect(result).toBe(null);
            expect(mockComputeChecksum).not.toHaveBeenCalled();
        });

        it("returns null when file has no data", async () => {
            const file: LocalAudioFileForSync = {
                id: 1,
                path: "/music.mp3",
                data: undefined,
            };
            const result = await prepareAudioSyncResult(
                file,
                [],
                mockComputeChecksum,
            );
            expect(result).toBe(null);
            expect(mockComputeChecksum).not.toHaveBeenCalled();
        });

        it("returns result with serverAudioFileId when checksum matches", async () => {
            mockComputeChecksum.mockResolvedValue("match-me");
            const file: LocalAudioFileForSync = {
                id: 1,
                path: "/music.mp3",
                data: new ArrayBuffer(4),
            };
            const serverFiles: ServerAudioFileWithChecksum[] = [
                { id: 100, checksum: "other" },
                { id: 200, checksum: "match-me" },
            ];
            const result = await prepareAudioSyncResult(
                file,
                serverFiles,
                mockComputeChecksum,
            );
            expect(result).not.toBe(null);
            expect(result?.serverAudioFileId).toBe(200);
            expect(result?.selectedAudioFileWithData).toBe(file);
            expect(mockComputeChecksum).toHaveBeenCalledWith(file.data);
        });

        it("returns result with serverAudioFileId null when no match", async () => {
            mockComputeChecksum.mockResolvedValue("no-match");
            const file: LocalAudioFileForSync = {
                id: 1,
                path: "/music.mp3",
                data: new ArrayBuffer(4),
            };
            const result = await prepareAudioSyncResult(
                file,
                [{ id: 1, checksum: "other" }],
                mockComputeChecksum,
            );
            expect(result).not.toBe(null);
            expect(result?.serverAudioFileId).toBe(null);
            expect(result?.selectedAudioFileWithData).toBe(file);
        });
    });

    describe("buildAudioUploadFormData", () => {
        const durationSeconds = 120.5;
        const sizeMegabytes = 0.003;

        it("builds FormData with file, nickname, set_as_default, duration_seconds, size_megabytes", () => {
            const file: LocalAudioFileForSync = {
                id: 1,
                path: "/folder/show_music.mp3",
                nickname: "Show Music",
                data: new ArrayBuffer(10),
            };
            const formData = buildAudioUploadFormData(
                file,
                durationSeconds,
                sizeMegabytes,
            );
            expect(formData.get("nickname")).toBe("Show Music");
            expect(formData.get("set_as_default")).toBe("true");
            expect(formData.get("duration_seconds")).toBe(
                String(durationSeconds),
            );
            expect(formData.get("size_megabytes")).toBe(String(sizeMegabytes));
            expect(formData.get("file")).toBeInstanceOf(Blob);
        });

        it("uses path basename as filename when nickname missing", () => {
            const file: LocalAudioFileForSync = {
                id: 1,
                path: "/deep/folder/beat.wav",
                data: new ArrayBuffer(4),
            };
            const formData = buildAudioUploadFormData(file, 60, 0.001);
            expect(formData.get("nickname")).toBe("beat.wav");
        });

        it("throws when file has no data", () => {
            const file: LocalAudioFileForSync = {
                id: 1,
                path: "/x.mp3",
                data: undefined,
            };
            expect(() => buildAudioUploadFormData(file, 0, 0)).toThrow(
                "Audio file has no data",
            );
        });

        it("uses basename for nickname when path is full filesystem path", () => {
            const file: LocalAudioFileForSync = {
                id: 1,
                path: "/Users/openmarchdev/Documents/LHS/IDL 2026/Lightridge Indoor 2026 Show.mp3",
                nickname:
                    "/Users/openmarchdev/Documents/LHS/IDL 2026/Lightridge Indoor 2026 Show.mp3",
                data: new ArrayBuffer(4),
            };
            const formData = buildAudioUploadFormData(file, 0, 0);
            expect(formData.get("nickname")).toBe(
                "Lightridge Indoor 2026 Show.mp3",
            );
        });

        it("creates blob with audio MIME type from extension", () => {
            const file: LocalAudioFileForSync = {
                id: 1,
                path: "/folder/show.wav",
                data: new ArrayBuffer(4),
            };
            const formData = buildAudioUploadFormData(file, 0, 0);
            const fileEntry = formData.get("file");
            expect(fileEntry).toBeInstanceOf(Blob);
            expect((fileEntry as Blob).type).toBe("audio/wav");
        });
    });
});
