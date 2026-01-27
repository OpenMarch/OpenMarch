import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "../../../database/db";
import {
    uploadDatabaseToServer,
    type UploadProgressCallback,
} from "../upload-service";

// Fake gzipped blob – we only care that it's some bytes; dots-to-om tests real structure.
const FAKE_GZIPPED_BLOB = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00]);

// Minimal workspace settings JSON that parses and includes otmProductionId when linked
const workspaceJson = (otmProductionId?: string) =>
    JSON.stringify({
        defaultBeatsPerMeasure: 4,
        defaultTempo: 120,
        defaultNewPageCounts: 16,
        audioOffsetSeconds: 0,
        pageNumberOffset: 0,
        measurementOffset: 1,
        ...(otmProductionId != null && { otmProductionId }),
    });

const mockAuthenticatedFetch = vi.fn();
const mockToCompressedOpenMarchBytes = vi.fn();

vi.mock("../api-client", () => ({
    authenticatedFetch: (path: string, options: RequestInit) =>
        mockAuthenticatedFetch(path, options),
}));

vi.mock("../dots-to-om", () => ({
    toCompressedOpenMarchBytes: (db: unknown) =>
        mockToCompressedOpenMarchBytes(db),
}));

function fakeDb(
    workspaceFindFirst: () => Promise<{ json_data: string } | null>,
) {
    return {
        query: {
            workspace_settings: {
                findFirst: vi.fn().mockImplementation(workspaceFindFirst),
            },
        },
    } as unknown as DB;
}

describe("upload-service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockToCompressedOpenMarchBytes.mockResolvedValue(FAKE_GZIPPED_BLOB);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe("uploadDatabaseToServer", () => {
        it("returns error when no OTM production is linked", async () => {
            const db = fakeDb(async () => null);
            mockAuthenticatedFetch.mockResolvedValue({ ok: true });

            const result = await uploadDatabaseToServer(db);

            expect(result.success).toBe(false);
            expect(result.error).toContain("No OTM production linked");
            expect(mockToCompressedOpenMarchBytes).not.toHaveBeenCalled();
            expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
        });

        it("returns error when workspace has no otmProductionId", async () => {
            const db = fakeDb(async () => ({
                json_data: workspaceJson(),
            }));
            mockAuthenticatedFetch.mockResolvedValue({ ok: true });

            const result = await uploadDatabaseToServer(db);

            expect(result.success).toBe(false);
            expect(result.error).toContain("No OTM production linked");
            expect(mockToCompressedOpenMarchBytes).not.toHaveBeenCalled();
            expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
        });

        it("returns success when production is linked and server returns created", async () => {
            const db = fakeDb(async () => ({
                json_data: workspaceJson("prod-123"),
            }));
            mockAuthenticatedFetch.mockResolvedValue({ ok: true });

            const result = await uploadDatabaseToServer(db);

            expect(result.success).toBe(true);
            expect(result.message).toBe("Revision created successfully");
            expect(mockToCompressedOpenMarchBytes).toHaveBeenCalledWith(db);
            expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
                "api/editor/v1/productions/prod-123/revisions",
                expect.objectContaining({
                    method: "POST",
                    body: expect.any(FormData),
                }),
            );
        });

        it("returns error when toCompressedOpenMarchBytes throws", async () => {
            const db = fakeDb(async () => ({
                json_data: workspaceJson("prod-123"),
            }));
            mockToCompressedOpenMarchBytes.mockRejectedValue(
                new Error("Db is not open"),
            );

            const result = await uploadDatabaseToServer(db);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Upload failed");
            expect(result.error).toContain("Db is not open");
            expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
        });

        it("returns error when authenticatedFetch throws", async () => {
            const db = fakeDb(async () => ({
                json_data: workspaceJson("prod-123"),
            }));
            mockAuthenticatedFetch.mockRejectedValue(
                new Error("Network error"),
            );

            const result = await uploadDatabaseToServer(db);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Upload failed");
            expect(result.error).toContain("Network error");
        });

        it("returns error when response is not ok", async () => {
            const db = fakeDb(async () => ({
                json_data: workspaceJson("prod-123"),
            }));
            mockAuthenticatedFetch.mockResolvedValue({
                ok: false,
                status: 422,
                text: () => Promise.resolve("Unprocessable entity"),
            });

            const result = await uploadDatabaseToServer(db);

            expect(result.success).toBe(false);
            expect(result.error).toContain("422");
            expect(result.error).toContain("Unprocessable entity");
        });

        it("invokes onProgress with error when no production is linked", async () => {
            const db = fakeDb(async () => null);
            const onProgress = vi.fn() as UploadProgressCallback;

            await uploadDatabaseToServer(db, undefined, onProgress);

            expect(onProgress).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "error",
                    error: expect.stringContaining("No OTM production linked"),
                }),
            );
        });

        it("invokes onProgress with success when upload succeeds", async () => {
            const db = fakeDb(async () => ({
                json_data: workspaceJson("prod-456"),
            }));
            mockAuthenticatedFetch.mockResolvedValue({ ok: true });
            const onProgress = vi.fn() as UploadProgressCallback;

            await uploadDatabaseToServer(db, undefined, onProgress);

            expect(onProgress).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "success",
                    message: "Revision created successfully",
                }),
            );
        });

        it("sends show_data and set_active in request body", async () => {
            const db = fakeDb(async () => ({
                json_data: workspaceJson("prod-789"),
            }));
            let capturedBody: FormData | undefined;
            mockAuthenticatedFetch.mockImplementation(
                (path: string, options: RequestInit) => {
                    capturedBody = options.body as FormData;
                    return Promise.resolve({ ok: true });
                },
            );

            await uploadDatabaseToServer(db);

            expect(capturedBody).toBeDefined();
            expect(capturedBody!.get("show_data")).toBeDefined();
            expect(capturedBody!.get("set_active")).toBe("true");
        });
    });
});
