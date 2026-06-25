import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadDatabaseToServer } from "../upload-service";
import type { DB } from "../../../../global/database/db";

const fieldPropertiesJson = () =>
    JSON.stringify({
        name: "Test Field",
        xCheckpoints: [
            { id: "left", name: "Left", stepsFromCenterFront: -8 },
            { id: "right", name: "Right", stepsFromCenterFront: 8 },
        ],
        yCheckpoints: [
            { id: "front", name: "Front", stepsFromCenterFront: 0 },
            { id: "back", name: "Back", stepsFromCenterFront: 8 },
        ],
        theme: {
            primaryStroke: { r: 1, g: 2, b: 3, a: 0.4 },
            secondaryStroke: { r: 5, g: 6, b: 7, a: 0.8 },
            tertiaryStroke: { r: 9, g: 10, b: 11, a: 0.12 },
            background: { r: 13, g: 14, b: 15, a: 0.16 },
            fieldLabel: { r: 17, g: 18, b: 19, a: 0.2 },
            externalLabel: { r: 21, g: 22, b: 23, a: 0.24 },
            previousPath: { r: 25, g: 26, b: 27, a: 0.28 },
            nextPath: { r: 29, g: 30, b: 31, a: 0.32 },
            shape: { r: 33, g: 34, b: 35, a: 0.36 },
            shapeType: "circle",
            tempPath: { r: 37, g: 38, b: 39, a: 0.4 },
            defaultMarcher: {
                fill: { r: 41, g: 42, b: 43, a: 0.44 },
                outline: { r: 45, g: 46, b: 47, a: 0.48 },
                label: { r: 49, g: 50, b: 51, a: 0.52 },
            },
        },
    });

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

function fakeDb({
    workspaceFindFirst,
    marchersFindMany,
    fieldPropertiesFindFirst = async () => ({
        json_data: fieldPropertiesJson(),
    }),
}: {
    workspaceFindFirst: () => Promise<{ json_data: string } | null>;
    marchersFindMany: () => Promise<
        { section: string | null; drill_prefix: string; drill_order: number }[]
    >;
    fieldPropertiesFindFirst?: () => Promise<{ json_data: string } | null>;
}) {
    return {
        query: {
            workspace_settings: {
                findFirst: vi.fn().mockImplementation(workspaceFindFirst),
            },
            marchers: {
                findMany: vi.fn().mockImplementation(marchersFindMany),
            },
            field_properties: {
                findFirst: vi.fn().mockImplementation(fieldPropertiesFindFirst),
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

        it("uploads revision with labels, prefix map, and canvas colors", async () => {
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
                    labels: ["T1", "B1"],
                    prefix_map: JSON.stringify({
                        T: "Trumpet",
                        B: "Trombone",
                    }),
                    canvas_background_color: "rgba(13, 14, 15, 0.16)",
                    canvas_primary_stroke: "rgba(1, 2, 3, 0.4)",
                    canvas_secondary_stroke: "rgba(5, 6, 7, 0.8)",
                    canvas_grid_stroke: "rgba(9, 10, 11, 0.12)",
                    canvas_performer_text_color: "rgba(49, 50, 51, 0.52)",
                }),
            );
        });

        it("includes most common section per prefix in prefix_map", async () => {
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

            expect(mockCreateRevision).toHaveBeenCalledWith(
                123,
                expect.objectContaining({
                    prefix_map: JSON.stringify({
                        T: "Trumpet",
                        C: "Clarinet",
                    }),
                }),
            );
        });
    });
});
