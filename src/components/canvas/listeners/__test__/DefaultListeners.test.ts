import DefaultListeners from "../DefaultListeners";
import OpenMarchCanvas from "../../OpenMarchCanvas";
import MarcherPage from "@/global/classes/MarcherPage";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { FieldProperties } from "@/global/classes/FieldProperties";
import {
    falsyUiSettings,
    mockMarcherPages,
    mockMarchers,
    mockPages,
} from "../../__test__/MocksForCanvas";
import { cleanup } from "@testing-library/react";
import { fabric } from "fabric";

describe("DefaultListeners", () => {
    const NCAAFieldProperties = new FieldProperties(
        FieldProperties.Template.NCAA
    );
    let canvas: OpenMarchCanvas;
    let listeners: DefaultListeners;

    beforeEach(() => {
        canvas = new OpenMarchCanvas(
            null,
            NCAAFieldProperties,
            falsyUiSettings,
            listeners
        );
        const selectedPage = mockPages[0];
        canvas.renderMarchers({
            allMarchers: mockMarchers,
            selectedMarcherPages: MarcherPage.filterByPageId(
                mockMarcherPages,
                selectedPage.id
            ),
        });
        listeners = new DefaultListeners({ canvas });
    });

    afterEach(() => {
        vi.clearAllMocks();
        cleanup();
    });

    describe("handleSelect", () => {
        it("should set the selected marcher when a single element is selected", () => {
            canvas.setSelectedCanvasMarchers = vi.fn();

            const canvasMarcherToSelect = canvas.getCanvasMarchers()[0];
            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("select"),
                selected: [canvasMarcherToSelect],
            };

            canvas.setActiveObject(canvasMarcherToSelect);

            // Expect the handleSelect function to not
            listeners.handleSelect(fabricEvent);
            expect(canvas.setSelectedCanvasMarchers).toHaveBeenCalledWith([
                canvasMarcherToSelect,
            ]);
        });
        it("should set the selected marcher when multiple marchers are selected", () => {
            canvas.setSelectedCanvasMarchers = vi.fn();

            const canvasMarchersToSelect = canvas.getCanvasMarchers();
            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("select"),
                selected: canvasMarchersToSelect,
            };

            const activeSelection = new fabric.ActiveSelection(
                canvasMarchersToSelect
            );
            canvas.setActiveObject(activeSelection);

            // Expect the handleSelect function to not
            listeners.handleSelect(fabricEvent);
            expect(canvas.setSelectedCanvasMarchers).toHaveBeenCalledWith(
                expect.arrayContaining(canvasMarchersToSelect)
            );
        });
        it("should set the selected marchers when a marcher is already selected", () => {
            canvas.setSelectedCanvasMarchers = vi.fn();

            const canvasMarchers = canvas.getCanvasMarchers();

            canvas.setActiveObject(canvasMarchers[0]);

            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("select"),
                selected: [canvasMarchers[1]],
            };

            const activeSelection = new fabric.ActiveSelection([
                canvasMarchers[0],
                canvasMarchers[1],
            ]);
            canvas.setActiveObject(activeSelection);

            // Expect the handleSelect function to not
            listeners.handleSelect(fabricEvent);
            expect(canvas.setSelectedCanvasMarchers).toHaveBeenCalledWith(
                expect.arrayContaining([canvasMarchers[0], canvasMarchers[1]])
            );
        });
        it("should set the selected marchers when multiple marchers are already selected", () => {
            canvas.setSelectedCanvasMarchers = vi.fn();

            const canvasMarchers = canvas.getCanvasMarchers();

            const activeSelection = new fabric.ActiveSelection([
                canvasMarchers[0],
                canvasMarchers[2],
            ]);
            canvas.setActiveObject(activeSelection);

            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("select"),
                selected: [canvasMarchers[1]],
            };

            const newActiveSelection = new fabric.ActiveSelection([
                canvasMarchers[0],
                canvasMarchers[2],
                canvasMarchers[1],
            ]);
            canvas.setActiveObject(newActiveSelection);

            // Expect the handleSelect function to not
            listeners.handleSelect(fabricEvent);
            expect(canvas.setSelectedCanvasMarchers).toHaveBeenCalledWith(
                expect.arrayContaining([
                    canvasMarchers[0],
                    canvasMarchers[1],
                    canvasMarchers[2],
                ])
            );
        });
    });

    describe("handleDeselect", () => {
        it("should call setSelectedCanvasMarchers with an empty array", () => {
            canvas.setGlobalsSelectedMarchers = vi.fn();

            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("deselected"),
                deselected: canvas.getCanvasMarchers(),
            };

            // Expect the handleSelect function to not
            listeners.handleDeselect(fabricEvent);
            expect(canvas.setGlobalsSelectedMarchers).toHaveBeenCalledWith([]);
        });
    });

    describe("handleObjectModified", () => {
        it.todo(
            "should not update the marcher if the mouse was clicked and not dragged"
        );
        it.todo("should update the marcher if the mouse was dragged");
    });

    describe("handleMouseDown", () => {
        it("should set the dragStart time and coordinates when selecting a marcher", () => {
            const before = Date.now();
            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("mousedown", { clientX: 123, clientY: 321 }),
                target: canvas.getCanvasMarchers()[0],
            };
            const after = Date.now();

            listeners.handleMouseDown(fabricEvent);

            expect(canvas.selectDragStart.time).toBeGreaterThanOrEqual(before);
            expect(canvas.selectDragStart.time).toBeLessThanOrEqual(after);
            expect(canvas.selectDragStart.x).toBe(123);
            expect(canvas.selectDragStart.y).toBe(321);
        });
        it("should set the dragStart time and coordinates when selecting a multiple marchers", () => {
            const before = Date.now();
            const activeSelection = new fabric.ActiveSelection(
                canvas.getCanvasMarchers()
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
        it("should set the canvas to dragging when selecting the canvas", () => {
            const fabricEvent: fabric.IEvent<MouseEvent> = {
                e: new MouseEvent("mousedown"),
            };

            expect(canvas.isDragging).toBe(false);
            expect(canvas.selection).toBe(true);

            listeners.handleMouseDown(fabricEvent);

            expect(canvas.isDragging).toBe(true);
            expect(canvas.selection).toBe(false);
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
                "setViewportTransform"
            );

            listeners.handleMouseUp(fabricEvent);

            expect(setViewportTransformSpy).toHaveBeenCalledWith(
                canvas.viewportTransform
            );
        });
    });
});
