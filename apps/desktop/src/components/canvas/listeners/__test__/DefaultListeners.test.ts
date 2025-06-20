import DefaultListeners from "../DefaultListeners";
import OpenMarchCanvas from "../../../../global/classes/canvasObjects/OpenMarchCanvas";
import MarcherPage from "@/global/classes/MarcherPage";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
    falsyUiSettings,
    mockMarcherPages,
    mockMarchers,
    mockPages,
} from "../../__test__/MocksForCanvas";
import { cleanup } from "@testing-library/react";
import { fabric } from "fabric";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { ElectronApi } from "electron/preload";

describe.skip("DefaultListeners", () => {
    const NCAAFieldProperties =
        FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
    let canvas: OpenMarchCanvas;
    let listeners: DefaultListeners;

    beforeEach(() => {
        window.electron = {
            getFieldPropertiesImage: vi.fn().mockResolvedValue({
                success: true,
                data: [1, 2, 3] as any as Buffer,
            }),
        } as Partial<ElectronApi> as ElectronApi;
        global.URL.createObjectURL = vi.fn(() => "mock-url");
        canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties: NCAAFieldProperties,
            uiSettings: falsyUiSettings,
            listeners: listeners,
            currentPage: mockPages[0],
        });
        const selectedPage = mockPages[0];
        canvas.renderMarchers({
            allMarchers: mockMarchers,
            currentMarcherPages: MarcherPage.filterByPageId(
                mockMarcherPages,
                selectedPage.id,
            ),
        });
        listeners = new DefaultListeners({ canvas });
    });

    afterEach(() => {
        canvas.dispose();
        vi.clearAllMocks();
        cleanup();
    });

    // describe("handleSelect", () => {
    //     it("should set the selected marcher when a single element is selected", () => {
    //         canvas.setSelectedCanvasMarchers = vi.fn();

    //         const canvasMarcherToSelect = canvas.getCanvasMarchers()[0];
    //         const fabricEvent: fabric.IEvent<MouseEvent> = {
    //             e: new MouseEvent("select"),
    //             selected: [canvasMarcherToSelect],
    //         };

    //         canvas.setActiveObject(canvasMarcherToSelect);

    //         // Expect the handleSelect function to not
    //         listeners.handleSelect(fabricEvent);
    //         expect(canvas.setSelectedCanvasMarchers).toHaveBeenCalledWith([
    //             canvasMarcherToSelect,
    //         ]);
    //     });
    //     it("should set the selected marcher when multiple marchers are selected", () => {
    //         canvas.setSelectedCanvasMarchers = vi.fn();

    //         const canvasMarchersToSelect = canvas.getCanvasMarchers();
    //         const fabricEvent: fabric.IEvent<MouseEvent> = {
    //             e: new MouseEvent("select"),
    //             selected: canvasMarchersToSelect,
    //         };

    //         const activeSelection = new fabric.ActiveSelection(
    //             canvasMarchersToSelect
    //         );
    //         canvas.setActiveObject(activeSelection);

    //         // Expect the handleSelect function to not
    //         listeners.handleSelect(fabricEvent);
    //         expect(canvas.setSelectedCanvasMarchers).toHaveBeenCalledWith(
    //             expect.arrayContaining(canvasMarchersToSelect)
    //         );
    //     });
    //     it("should set the selected marchers when a marcher is already selected", () => {
    //         canvas.setSelectedCanvasMarchers = vi.fn();

    //         const canvasMarchers = canvas.getCanvasMarchers();

    //         canvas.setActiveObject(canvasMarchers[0]);

    //         const fabricEvent: fabric.IEvent<MouseEvent> = {
    //             e: new MouseEvent("select"),
    //             selected: [canvasMarchers[1]],
    //         };

    //         const activeSelection = new fabric.ActiveSelection([
    //             canvasMarchers[0],
    //             canvasMarchers[1],
    //         ]);
    //         canvas.setActiveObject(activeSelection);

    //         // Expect the handleSelect function to not
    //         listeners.handleSelect(fabricEvent);
    //         expect(canvas.setSelectedCanvasMarchers).toHaveBeenCalledWith(
    //             expect.arrayContaining([canvasMarchers[0], canvasMarchers[1]])
    //         );
    //     });
    //     it("should set the selected marchers when multiple marchers are already selected", () => {
    //         canvas.setSelectedCanvasMarchers = vi.fn();

    //         const canvasMarchers = canvas.getCanvasMarchers();

    //         const activeSelection = new fabric.ActiveSelection([
    //             canvasMarchers[0],
    //             canvasMarchers[2],
    //         ]);
    //         canvas.setActiveObject(activeSelection);

    //         const fabricEvent: fabric.IEvent<MouseEvent> = {
    //             e: new MouseEvent("select"),
    //             selected: [canvasMarchers[1]],
    //         };

    //         const newActiveSelection = new fabric.ActiveSelection([
    //             canvasMarchers[0],
    //             canvasMarchers[2],
    //             canvasMarchers[1],
    //         ]);
    //         canvas.setActiveObject(newActiveSelection);

    //         // Expect the handleSelect function to not
    //         listeners.handleSelect(fabricEvent);
    //         expect(canvas.setSelectedCanvasMarchers).toHaveBeenCalledWith(
    //             expect.arrayContaining([
    //                 canvasMarchers[0],
    //                 canvasMarchers[1],
    //                 canvasMarchers[2],
    //             ])
    //         );
    //     });
    // });

    // describe("handleDeselect", () => {
    //     it("should call setSelectedCanvasMarchers with an empty array", () => {
    //         canvas.setGlobalSelectedMarchers = vi.fn();

    //         const fabricEvent: fabric.IEvent<MouseEvent> = {
    //             e: new MouseEvent("deselected"),
    //             deselected: canvas.getCanvasMarchers(),
    //         };

    //         // Expect the handleSelect function to not
    //         listeners.handleDeselect(fabricEvent);
    //         expect(canvas.setGlobalSelectedMarchers).toHaveBeenCalledWith([]);
    //     });
    // });

    describe("handleObjectModified", () => {
        it.todo(
            "should not update the marcher if the mouse was clicked and not dragged",
        );
        it.todo("should update the marcher if the mouse was dragged");
    });

    describe("handleMouseDown", () => {
        it("should set the dragStart time and coordinates when selecting a marcher", async () => {
            const before = Date.now();
            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("mousedown", { clientX: 123, clientY: 321 }),
                target: canvas.getCanvasMarchers()[0],
            };
            // sleep for 2 milliseconds
            await new Promise((r) => setTimeout(r, 2));

            listeners.handleMouseDown(fabricEvent);

            expect(canvas.selectDragStart.time).toBeGreaterThanOrEqual(before);
            const after = Date.now();
            expect(canvas.selectDragStart.time).toBeLessThanOrEqual(after);
            expect(canvas.selectDragStart.x).toBe(123);
            expect(canvas.selectDragStart.y).toBe(321);
        });
        it("should set the dragStart time and coordinates when selecting a multiple marchers", () => {
            const before = Date.now();
            const activeSelection = new fabric.ActiveSelection(
                canvas.getCanvasMarchers(),
            );
            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("mousedown", { clientX: 123, clientY: 321 }),
                target: activeSelection,
            };
            listeners.handleMouseDown(fabricEvent);
            const after = Date.now();

            expect(canvas.selectDragStart.time).toBeGreaterThanOrEqual(before);
            expect(canvas.selectDragStart.time).toBeLessThanOrEqual(after);
            expect(canvas.selectDragStart.x).toBe(123);
            expect(canvas.selectDragStart.y).toBe(321);
        });
        it("should not set the canvas to dragging when selecting the canvas and the shift key is pressed", () => {
            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("mousedown", { shiftKey: true }),
            };

            expect(canvas.isDragging).toBe(false);
            expect(canvas.selection).toBe(true);

            listeners.handleMouseDown(fabricEvent);

            expect(canvas.isDragging).toBe(false);
            expect(canvas.selection).toBe(true);
        });
    });

    describe("handleMouseMove", () => {
        it.todo("should drag the canvas when canvas.isDragging is true");
        it.todo("should not drag the canvas when canvas.isDragging is false");
    });

    describe("handleMouseUp", () => {
        it("should disable dragging and re-enable selection", () => {
            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("mouseup"),
            };

            canvas.isDragging = true;
            canvas.selection = false;
            canvas.viewportTransform = [1, 0, 0, 1, 0, 0];

            listeners.handleMouseUp(fabricEvent);

            expect(canvas.isDragging).toBe(false);
            expect(canvas.selection).toBe(true);
        });

        it("should recalculate new interaction for all objects", () => {
            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("mouseup"),
            };

            const setViewportTransformSpy = vi.spyOn(
                canvas,
                "setViewportTransform",
            );

            listeners.handleMouseUp(fabricEvent);

            expect(setViewportTransformSpy).toHaveBeenCalledWith(
                canvas.viewportTransform,
            );
        });
    });
});
