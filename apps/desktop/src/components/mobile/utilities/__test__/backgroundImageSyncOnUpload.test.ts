import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    prepareBackgroundImageSyncResult,
    buildBackgroundImageFormData,
} from "../backgroundImageSyncOnUpload";

describe("backgroundImageSyncOnUpload", () => {
    describe("prepareBackgroundImageSyncResult", () => {
        const mockComputeChecksum = vi.fn();

        beforeEach(() => {
            mockComputeChecksum.mockClear();
        });

        it("returns null when local image is null", async () => {
            const result = await prepareBackgroundImageSyncResult(
                null,
                null,
                mockComputeChecksum,
            );
            expect(result).toBe(null);
            expect(mockComputeChecksum).not.toHaveBeenCalled();
        });

        it("returns null when local image is empty Uint8Array", async () => {
            const result = await prepareBackgroundImageSyncResult(
                new Uint8Array(0),
                null,
                mockComputeChecksum,
            );
            expect(result).toBe(null);
            expect(mockComputeChecksum).not.toHaveBeenCalled();
        });

        it("returns result with needsUpload true when server checksum is null", async () => {
            mockComputeChecksum.mockResolvedValue("abc123");
            const imageData = new Uint8Array([1, 2, 3]);
            const result = await prepareBackgroundImageSyncResult(
                imageData,
                null,
                mockComputeChecksum,
            );
            expect(result).not.toBe(null);
            expect(result?.localChecksum).toBe("abc123");
            expect(result?.imageData).toBe(imageData);
            expect(result?.needsUpload).toBe(true);
            expect(mockComputeChecksum).toHaveBeenCalledWith(imageData);
        });

        it("returns result with needsUpload true when server checksum differs from local", async () => {
            mockComputeChecksum.mockResolvedValue("local-checksum");
            const imageData = new Uint8Array([4, 5, 6]);
            const result = await prepareBackgroundImageSyncResult(
                imageData,
                "server-different-checksum",
                mockComputeChecksum,
            );
            expect(result).not.toBe(null);
            expect(result?.localChecksum).toBe("local-checksum");
            expect(result?.needsUpload).toBe(true);
        });

        it("returns result with needsUpload false when server checksum matches local", async () => {
            mockComputeChecksum.mockResolvedValue("same-checksum");
            const imageData = new Uint8Array([7, 8, 9]);
            const result = await prepareBackgroundImageSyncResult(
                imageData,
                "same-checksum",
                mockComputeChecksum,
            );
            expect(result).not.toBe(null);
            expect(result?.localChecksum).toBe("same-checksum");
            expect(result?.imageData).toBe(imageData);
            expect(result?.needsUpload).toBe(false);
        });
    });

    describe("buildBackgroundImageFormData", () => {
        it("builds FormData with file entry using default filename", () => {
            const imageData = new Uint8Array([1, 2, 3, 4, 5]);
            const formData = buildBackgroundImageFormData(imageData);
            expect(formData.get("file")).toBeInstanceOf(Blob);
            const fileEntry = formData.get("file") as Blob;
            expect(fileEntry.type).toBe("image/png");
            expect(fileEntry.size).toBe(5);
        });

        it("builds FormData with file entry using custom filename", () => {
            const imageData = new Uint8Array([10, 20]);
            const formData = buildBackgroundImageFormData(
                imageData,
                "field-bg.jpg",
            );
            expect(formData.get("file")).toBeInstanceOf(Blob);
            const fileEntry = formData.get("file") as File;
            expect(fileEntry.name).toBe("field-bg.jpg");
        });

        it("creates blob with same bytes as input", async () => {
            const imageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
            const formData = buildBackgroundImageFormData(imageData);
            const fileEntry = formData.get("file") as Blob;
            const buffer = await fileEntry.arrayBuffer();
            expect(new Uint8Array(buffer)).toEqual(imageData);
        });
    });
});
