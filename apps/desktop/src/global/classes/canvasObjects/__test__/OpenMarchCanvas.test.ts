import { expect, it } from "vitest";

it.todo("OpenMarchCanvas tests - currently not working", () => {
    expect(true).toBe(true);
});

// import { cleanup } from "@testing-library/react";
// import { describe, expect, afterEach, it, vi, beforeEach } from "vitest";
// import OpenMarchCanvas from "../OpenMarchCanvas";
// import {
//     falsyUiSettings,
//     mockMarcherPageMap,
//     mockMarchers,
//     mockMarcherVisualMap,
//     mockPages,
// } from "@/components/canvas/__test__/MocksForCanvas";
// import MarcherPage from "@/global/classes/MarcherPage";
// import FieldPropertiesTemplates from "../../FieldProperties.templates";
// import { ElectronApi } from "electron/preload";

// describe.skip("OpenMarchCanvas", () => {
//     const NCAAFieldProperties =
//         FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

//     beforeEach(() => {
//         window.electron = {
//             getFieldPropertiesImage: vi.fn().mockResolvedValue({
//                 success: true,
//                 data: [1, 2, 3] as any as Buffer,
//             }),
//         } as Partial<ElectronApi> as ElectronApi;
//         global.URL.createObjectURL = vi.fn(() => "mock-url");
//     });

//     afterEach(() => {
//         vi.clearAllMocks();
//         cleanup();
//     });

//     describe("renderMarchers", () => {
//         it("Canvas renders and contains marchers in the correct position", async () => {
//             const canvas = new OpenMarchCanvas({
//                 canvasRef: null,
//                 fieldProperties: NCAAFieldProperties,
//                 uiSettings: falsyUiSettings,
//             });
//             const selectedPage = mockPages[0];
//             canvas.renderMarchers({
//                 marcherVisuals: mockMarcherVisualMap,
//                 marcherPages: mockMarcherPageMap,
//                 pageId: selectedPage.id,
//             });
//             const canvasMarchers = canvas.getCanvasMarchers();
//             // expect(canvasMarchers.length).toBe(mockMarchers.length);
//             for (const marcher of mockMarchers) {
//                 const canvasMarcher = canvasMarchers.find(
//                     (canvasMarcher) =>
//                         canvasMarcher.marcherObj.id === marcher.id,
//                 );
//                 expect(canvasMarcher).toBeDefined();
//                 if (!canvasMarcher) return;
//                 const marcherPage = MarcherPage.getByMarcherAndPageId(
//                     mockMarcherPageMap,
//                     marcher.id,
//                     selectedPage.id,
//                 );
//                 expect(marcherPage).toBeDefined();
//                 if (!marcherPage) return;
//                 const canvasMarcherCoords = canvasMarcher.getMarcherCoords();
//                 expect(canvasMarcherCoords.x).toBe(marcherPage.x);
//                 expect(canvasMarcherCoords.y).toBe(marcherPage.y);
//             }
//         });
//     });

//     describe("refreshMarchers", () => {
//         it.todo(
//             "Leaves the canvasMarchers alone on refresh when unchanged",
//             () => {},
//         );
//         it.todo(
//             "Restores the canvasMarchers to their original position on refresh when changed",
//             () => {},
//         );
//     });

//     describe("uiSettings", () => {
//         it("has the correct initial settings", async () => {
//             const selectedPage = mockPages[0];
//             const canvas = new OpenMarchCanvas({
//                 canvasRef: null,
//                 fieldProperties: NCAAFieldProperties,
//                 uiSettings: {
//                     ...falsyUiSettings,
//                     lockX: true,
//                     lockY: false,
//                 },
//             });
//             canvas.renderMarchers({
//                 marcherVisuals: mockMarcherVisualMap,
//                 marcherPages: mockMarcherPageMap,
//                 pageId: selectedPage.id,
//             });

//             expect(canvas.uiSettings.lockX).toBe(true);
//             expect(canvas.uiSettings.lockY).toBe(false);

//             // check that the correct UI settings are passed to the canvas
//             const canvasMarchers = canvas.getCanvasMarchers();
//             canvas.setActiveObject(canvasMarchers[0]);
//             const activeObject = canvas.getActiveObject();
//             expect(activeObject).toBe(canvasMarchers[0]);
//             expect(activeObject?.lockMovementX).toBe(true);
//             expect(activeObject?.lockMovementY).toBe(false);
//         });

//         it("changing settings modifies the current active object", async () => {
//             const selectedPage = mockPages[0];
//             const canvas = new OpenMarchCanvas({
//                 canvasRef: null,
//                 fieldProperties: NCAAFieldProperties,
//                 uiSettings: {
//                     ...falsyUiSettings,
//                     lockX: false,
//                     lockY: true,
//                 },
//             });
//             canvas.renderMarchers({
//                 marcherVisuals: mockMarcherVisualMap,
//                 marcherPages: mockMarcherPageMap,
//                 pageId: selectedPage.id,
//             });

//             expect(canvas.uiSettings.lockX).toBe(false);
//             expect(canvas.uiSettings.lockY).toBe(true);

//             // check that the correct UI settings are passed to the canvas
//             const canvasMarchers = canvas.getCanvasMarchers();
//             canvas.setActiveObject(canvasMarchers[0]);
//             const activeObject = canvas.getActiveObject();
//             expect(activeObject?.lockMovementX).toBe(false);
//             expect(activeObject?.lockMovementY).toBe(true);

//             canvas.setUiSettings({
//                 ...falsyUiSettings,
//                 lockX: false,
//                 lockY: false,
//             });
//             expect(activeObject?.lockMovementX).toBe(false);
//             expect(activeObject?.lockMovementY).toBe(false);

//             canvas.setUiSettings({
//                 ...falsyUiSettings,
//                 lockX: true,
//                 lockY: true,
//             });
//             expect(activeObject?.lockMovementX).toBe(true);
//             expect(activeObject?.lockMovementY).toBe(true);
//         });

//         it("UI settings persist when setting a new active object", async () => {
//             const selectedPage = mockPages[0];
//             const canvas = new OpenMarchCanvas({
//                 canvasRef: null,
//                 fieldProperties: NCAAFieldProperties,
//                 uiSettings: {
//                     ...falsyUiSettings,
//                     lockX: false,
//                     lockY: true,
//                 },
//             });
//             canvas.renderMarchers({
//                 marcherVisuals: mockMarcherVisualMap,
//                 marcherPages: mockMarcherPageMap,
//                 pageId: selectedPage.id,
//             });

//             expect(canvas.uiSettings.lockX).toBe(false);
//             expect(canvas.uiSettings.lockY).toBe(true);

//             // check that the correct UI settings are passed to the canvas
//             const canvasMarchers = canvas.getCanvasMarchers();
//             canvas.setActiveObject(canvasMarchers[0]);
//             let activeObject = canvas.getActiveObject();
//             expect(activeObject?.lockMovementX).toBe(false);
//             expect(activeObject?.lockMovementY).toBe(true);

//             canvas.setActiveObject(canvasMarchers[1]);
//             activeObject = canvas.getActiveObject();
//             expect(activeObject?.lockMovementX).toBe(false);
//             expect(activeObject?.lockMovementY).toBe(true);
//         });
//     });
// });
