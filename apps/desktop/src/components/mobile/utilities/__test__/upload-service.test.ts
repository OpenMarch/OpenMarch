import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadDatabaseToServer } from "../upload-service";
import type { DB } from "../../../../global/database/db";

const FAKE_GZIPPED_BLOB = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00]);

const workspaceJson = (otmProductionId?: number) =>
    JSON.stringify({
        defaultBeatsPerMeasure: 4,
        defaultTempo: 120,
        defaultNewPageCounts: 16,
        audioOffsetSeconds: 0,
        pageNumberOffset: 0,
        measurementOffset: 1,
        ...(otmProductionId != null && { otmProductionId }),
    });

const mockToCompressedOpenMarchBytes = vi.fn();
const mockCreateRevision = vi.fn();
const mockPatchPerformerLabels = vi.fn();
const mockPatchSectionPrefixMap = vi.fn();

vi.mock("../dots-to-om", () => ({
    toCompressedOpenMarchBytes: (db: unknown) =>
        mockToCompressedOpenMarchBytes(db),
}));

vi.mock("@/api/generated/production-revisions/production-revisions", () => ({
    postApiEditorV1ProductionsProductionIdRevisions: (
        productionId: number,
        body: unknown,
    ) => mockCreateRevision(productionId, body),
}));

vi.mock("@/api/generated/performer-labels/performer-labels", () => ({
    patchApiEditorV1EnsemblesEnsembleIdPerformerLabels: (
        ensembleId: number,
        body: unknown,
    ) => mockPatchPerformerLabels(ensembleId, body),
}));

vi.mock("@/api/generated/section-prefix-map/section-prefix-map", () => ({
    patchApiEditorV1EnsemblesEnsembleIdSectionPrefixMap: (
        ensembleId: number,
        body: unknown,
    ) => mockPatchSectionPrefixMap(ensembleId, body),
}));

function fakeDb({
    workspaceFindFirst,
    marchersFindMany,
}: {
    workspaceFindFirst: () => Promise<{ json_data: string } | null>;
    marchersFindMany: () => Promise<
        { section: string | null; drill_prefix: string; drill_order: number }[]
    >;
}) {
    return {
        query: {
            workspace_settings: {
                findFirst: vi.fn().mockImplementation(workspaceFindFirst),
            },
            marchers: {
                findMany: vi.fn().mockImplementation(marchersFindMany),
            },
        },
    } as unknown as DB;
}

describe("upload-service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockToCompressedOpenMarchBytes.mockResolvedValue(FAKE_GZIPPED_BLOB);
        mockCreateRevision.mockResolvedValue({
            revision: { ensemble_id: 456 },
        });
        mockPatchPerformerLabels.mockResolvedValue({});
        mockPatchSectionPrefixMap.mockResolvedValue({});
    });

    describe("uploadDatabaseToServer", () => {
        it("throws when no OTM production is linked", async () => {
            const db = fakeDb({
                workspaceFindFirst: async () => null,
                marchersFindMany: async () => [],
            });

            await expect(uploadDatabaseToServer(db)).rejects.toThrow(
                "No OTM production linked",
            );
            expect(mockToCompressedOpenMarchBytes).not.toHaveBeenCalled();
            expect(mockCreateRevision).not.toHaveBeenCalled();
        });

        it("uploads revision and patches performer labels", async () => {
            const db = fakeDb({
                workspaceFindFirst: async () => ({
                    json_data: workspaceJson(123),
                }),
                marchersFindMany: async () => [
                    { section: "Trumpet", drill_prefix: "T", drill_order: 1 },
                    { section: "Trombone", drill_prefix: "B", drill_order: 1 },
                ],
            });

            const result = await uploadDatabaseToServer(db, " My Title ");

            expect(result).toEqual({
                success: true,
                ensembleId: 456,
                message: "Revision created successfully",
            });
            expect(mockToCompressedOpenMarchBytes).toHaveBeenCalledWith(db);
            expect(mockCreateRevision).toHaveBeenCalledWith(
                123,
                expect.objectContaining({
                    show_data: expect.any(Blob),
                    set_active: true,
                    title: "My Title",
                }),
            );
            expect(mockPatchPerformerLabels).toHaveBeenCalledWith(456, {
                labels: ["T1", "B1"],
            });
        });

        it("patches section prefix map with most common sections per prefix", async () => {
            const db = fakeDb({
                workspaceFindFirst: async () => ({
                    json_data: workspaceJson(123),
                }),
                marchersFindMany: async () => [
                    { section: "Trumpet", drill_prefix: "T", drill_order: 1 },
                    { section: "Trumpet", drill_prefix: "T", drill_order: 2 },
                    { section: "Trombone", drill_prefix: "T", drill_order: 3 },
                    { section: null, drill_prefix: "C", drill_order: 1 },
                    { section: "Clarinet", drill_prefix: "C", drill_order: 2 },
                    { section: null, drill_prefix: "N", drill_order: 1 },
                ],
            });

            await uploadDatabaseToServer(db);

            expect(mockPatchSectionPrefixMap).toHaveBeenCalledWith(456, {
                prefix_map: {
                    T: "Trumpet",
                    C: "Clarinet",
                },
            });
        });
    });
});
