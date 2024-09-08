import { cleanup } from "@testing-library/react";
import { describe, expect, afterEach, it, vi } from "vitest";
import OpenMarchCanvas from "../OpenMarchCanvas";
import { FieldProperties } from "@/global/classes/FieldProperties";
import {
    falsyUiSettings,
    mockMarcherPages,
    mockMarchers,
    mockPages,
} from "./MocksForCanvas";
import MarcherPage from "@/global/classes/MarcherPage";

describe("OpenMarchCanvas", () => {
    const NCAAFieldProperties = new FieldProperties(
        FieldProperties.Template.NCAA
    );

    afterEach(() => {
        vi.clearAllMocks();
        cleanup();
    });

    describe("renderMarchers", () => {
        it("Canvas renders and contains marchers in the correct position", () => {
            const canvas = new OpenMarchCanvas({
                canvasRef: null,
                fieldProperties: NCAAFieldProperties,
                uiSettings: falsyUiSettings,
            });
            const selectedPage = mockPages[0];
            canvas.renderMarchers({
                allMarchers: mockMarchers,
                selectedMarcherPages: MarcherPage.filterByPageId(
                    mockMarcherPages,
                    selectedPage.id
                ),
            });
            const canvasMarchers = canvas.getCanvasMarchers();
            // expect(canvasMarchers.length).toBe(mockMarchers.length);
            for (const marcher of mockMarchers) {
                const canvasMarcher = canvasMarchers.find(
                    (canvasMarcher) =>
                        canvasMarcher.marcherObj.id === marcher.id
                );
                expect(canvasMarcher).toBeDefined();
                if (!canvasMarcher) return;
                const marcherPage = mockMarcherPages.find(
                    (marcherPage) =>
                        marcherPage.marcher_id === marcher.id &&
                        marcherPage.page_id === selectedPage.id
                );
                expect(marcherPage).toBeDefined();
                if (!marcherPage) return;
                const canvasMarcherCoords = canvasMarcher.getMarcherCoords();
                expect(canvasMarcherCoords.x).toBe(marcherPage.x);
                expect(canvasMarcherCoords.y).toBe(marcherPage.y);
            }
        });
    });

    describe("refreshMarchers", () => {
        it.todo(
            "Leaves the canvasMarchers alone on refresh when unchanged",
            () => {}
        );
        it.todo(
            "Restores the canvasMarchers to their original position on refresh when changed",
            () => {}
        );
    });

    describe("uiSettings", () => {
        it("has the correct initial settings", () => {
            const selectedPage = mockPages[0];
            const canvas = new OpenMarchCanvas({
                canvasRef: null,
                fieldProperties: NCAAFieldProperties,
                uiSettings: {
                    ...falsyUiSettings,
                    lockX: true,
                    lockY: false,
                },
            });
            canvas.renderMarchers({
                allMarchers: mockMarchers,
                selectedMarcherPages: MarcherPage.filterByPageId(
                    mockMarcherPages,
                    selectedPage.id
                ),
            });

            expect(canvas.uiSettings.lockX).toBe(true);
            expect(canvas.uiSettings.lockY).toBe(false);

            // check that the correct UI settings are passed to the canvas
            const canvasMarchers = canvas.getCanvasMarchers();
            canvas.setActiveObject(canvasMarchers[0]);
            const activeObject = canvas.getActiveObject();
            expect(activeObject).toBe(canvasMarchers[0]);
            expect(activeObject?.lockMovementX).toBe(true);
            expect(activeObject?.lockMovementY).toBe(false);
        });

        it("changing settings modifies the current active object", () => {
            const selectedPage = mockPages[0];
            const canvas = new OpenMarchCanvas({
                canvasRef: null,
                fieldProperties: NCAAFieldProperties,
                uiSettings: {
                    ...falsyUiSettings,
                    lockX: false,
                    lockY: true,
                },
            });
            canvas.renderMarchers({
                allMarchers: mockMarchers,
                selectedMarcherPages: MarcherPage.filterByPageId(
                    mockMarcherPages,
                    selectedPage.id
                ),
            });

            expect(canvas.uiSettings.lockX).toBe(false);
            expect(canvas.uiSettings.lockY).toBe(true);

            // check that the correct UI settings are passed to the canvas
            const canvasMarchers = canvas.getCanvasMarchers();
            canvas.setActiveObject(canvasMarchers[0]);
            const activeObject = canvas.getActiveObject();
            expect(activeObject?.lockMovementX).toBe(false);
            expect(activeObject?.lockMovementY).toBe(true);

            canvas.setUiSettings({
                ...falsyUiSettings,
                lockX: false,
                lockY: false,
            });
            expect(activeObject?.lockMovementX).toBe(false);
            expect(activeObject?.lockMovementY).toBe(false);

            canvas.setUiSettings({
                ...falsyUiSettings,
                lockX: true,
                lockY: true,
            });
            expect(activeObject?.lockMovementX).toBe(true);
            expect(activeObject?.lockMovementY).toBe(true);
        });

        it("UI settings persist when setting a new active object", () => {
            const selectedPage = mockPages[0];
            const canvas = new OpenMarchCanvas({
                canvasRef: null,
                fieldProperties: NCAAFieldProperties,
                uiSettings: {
                    ...falsyUiSettings,
                    lockX: false,
                    lockY: true,
                },
            });
            canvas.renderMarchers({
                allMarchers: mockMarchers,
                selectedMarcherPages: MarcherPage.filterByPageId(
                    mockMarcherPages,
                    selectedPage.id
                ),
            });

            expect(canvas.uiSettings.lockX).toBe(false);
            expect(canvas.uiSettings.lockY).toBe(true);

            // check that the correct UI settings are passed to the canvas
            const canvasMarchers = canvas.getCanvasMarchers();
            canvas.setActiveObject(canvasMarchers[0]);
            let activeObject = canvas.getActiveObject();
            expect(activeObject?.lockMovementX).toBe(false);
            expect(activeObject?.lockMovementY).toBe(true);

            canvas.setActiveObject(canvasMarchers[1]);
            activeObject = canvas.getActiveObject();
            expect(activeObject?.lockMovementX).toBe(false);
            expect(activeObject?.lockMovementY).toBe(true);
        });
    });
});
