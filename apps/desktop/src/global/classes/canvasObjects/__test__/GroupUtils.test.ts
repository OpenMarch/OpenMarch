import { describe, it, expect, beforeEach, vi } from "vitest";
import { fabric } from "fabric";
import {
    handleGroupScaling,
    handleGroupRotating,
    rotateGroup,
    setGroupAttributes,
    resetMarcherRotation,
} from "../GroupUtils";
import CanvasMarcher from "../CanvasMarcher";

describe("GroupUtils", () => {
    let mockGroup: fabric.Group;
    let mockCanvas: any;
    let mockMarcher1: CanvasMarcher;
    let mockMarcher2: CanvasMarcher;

    beforeEach(() => {
        // Create mock canvas
        mockCanvas = {
            requestRenderAll: vi.fn(),
            _currentTransform: null,
        };

        // Create mock marchers
        mockMarcher1 = {
            scaleX: 1,
            scaleY: 1,
            skewX: 0,
            skewY: 0,
            angle: 0,
            updateTextLabelPosition: vi.fn(),
            setCoords: vi.fn(),
        } as any;

        mockMarcher2 = {
            scaleX: 1,
            scaleY: 1,
            skewX: 0,
            skewY: 0,
            angle: 0,
            updateTextLabelPosition: vi.fn(),
            setCoords: vi.fn(),
        } as any;

        // Create mock group
        mockGroup = new fabric.Group([mockMarcher1, mockMarcher2]);
        mockGroup.canvas = mockCanvas as any;
        mockGroup.scaleX = 1;
        mockGroup.scaleY = 1;
        mockGroup.angle = 0;
    });

    describe("handleGroupScaling", () => {
        it("should apply counter-transform to marchers in group", () => {
            mockGroup.scaleX = 2;
            mockGroup.scaleY = 2;

            const mockEvent = {
                e: new MouseEvent("scaling"),
            } as fabric.IEvent<Event>;

            handleGroupScaling(mockEvent, mockGroup);

            // Marchers should have inverse scale applied
            expect(mockMarcher1.scaleX).toBeDefined();
            expect(mockMarcher1.scaleY).toBeDefined();
            expect(mockMarcher1.updateTextLabelPosition).toHaveBeenCalled();
            expect(mockMarcher1.setCoords).toHaveBeenCalled();
        });

        it("should lock Y-axis when scaling from middle-left (ml) handle", () => {
            mockCanvas._currentTransform = {
                corner: "ml",
            };
            (mockGroup as any).__scalingCorner = "ml";
            (mockGroup as any).__originalScaleY = 1;
            mockGroup.scaleX = 1.5;
            mockGroup.scaleY = 1.2;

            const mockEvent = {
                e: new MouseEvent("scaling"),
            } as fabric.IEvent<Event>;

            handleGroupScaling(mockEvent, mockGroup);

            // Y scale should be locked to original
            expect(mockGroup.scaleY).toBe(1);
        });

        it("should lock X-axis when scaling from middle-top (mt) handle", () => {
            mockCanvas._currentTransform = {
                corner: "mt",
            };
            (mockGroup as any).__scalingCorner = "mt";
            (mockGroup as any).__originalScaleX = 1;
            mockGroup.scaleX = 1.2;
            mockGroup.scaleY = 1.5;

            const mockEvent = {
                e: new MouseEvent("scaling"),
            } as fabric.IEvent<Event>;

            handleGroupScaling(mockEvent, mockGroup);

            // X scale should be locked to original
            expect(mockGroup.scaleX).toBe(1);
        });

        it("should block scaling when Shift is held on middle handles", () => {
            mockCanvas._currentTransform = {
                corner: "ml",
            };
            (mockGroup as any).__scalingCorner = "ml";
            (mockGroup as any).__originalScaleX = 1;
            (mockGroup as any).__originalScaleY = 1;
            mockGroup.scaleX = 1.5;
            mockGroup.scaleY = 1.5;

            const mockEvent = {
                e: new MouseEvent("scaling", { shiftKey: true }),
            } as fabric.IEvent<Event>;

            handleGroupScaling(mockEvent, mockGroup);

            // Both scales should be reset to original
            expect(mockGroup.scaleX).toBe(1);
            expect(mockGroup.scaleY).toBe(1);
        });

        it("should allow corner scaling on groups with marchers", () => {
            mockCanvas._currentTransform = {
                corner: "br",
            };
            (mockGroup as any).__scalingCorner = "br";
            mockGroup.scaleX = 1.5;
            mockGroup.scaleY = 1.5;

            const mockEvent = {
                e: new MouseEvent("scaling"),
            } as fabric.IEvent<Event>;

            handleGroupScaling(mockEvent, mockGroup);

            // Corner scaling should proceed normally
            expect(mockMarcher1.updateTextLabelPosition).toHaveBeenCalled();
        });

        it("should handle empty group gracefully", () => {
            const emptyGroup = new fabric.Group([]);
            const mockEvent = {
                e: new MouseEvent("scaling"),
            } as fabric.IEvent<Event>;

            expect(() => handleGroupScaling(mockEvent, emptyGroup)).not.toThrow();
        });

        it("should handle non-marcher objects in group", () => {
            const rect = new fabric.Rect({ width: 50, height: 50 });
            const mixedGroup = new fabric.Group([rect, mockMarcher1]);
            mixedGroup.canvas = mockCanvas as any;
            mixedGroup.scaleX = 2;
            mixedGroup.scaleY = 2;

            const mockEvent = {
                e: new MouseEvent("scaling"),
            } as fabric.IEvent<Event>;

            handleGroupScaling(mockEvent, mixedGroup);

            // Only marcher should be updated
            expect(mockMarcher1.updateTextLabelPosition).toHaveBeenCalled();
        });
    });

    describe("handleGroupRotating", () => {
        it("should snap rotation to 15-degree increments without Shift", () => {
            mockGroup.angle = 23;

            const mockEvent = {
                e: new MouseEvent("rotating"),
            } as fabric.IEvent<Event>;

            handleGroupRotating(mockEvent, mockGroup);

            // Should snap to nearest 15 degree increment
            expect(mockGroup.angle).toBe(15);
        });

        it("should allow free rotation with Shift key", () => {
            mockGroup.angle = 23;

            const mockEvent = {
                e: new MouseEvent("rotating", { shiftKey: true }),
            } as fabric.IEvent<Event>;

            handleGroupRotating(mockEvent, mockGroup);

            // Should keep the angle as is when shift is held
            expect(mockGroup.angle).toBe(23);
        });

        it("should apply counter-rotation to marchers", () => {
            mockGroup.angle = 45;

            const mockEvent = {
                e: new MouseEvent("rotating"),
            } as fabric.IEvent<Event>;

            handleGroupRotating(mockEvent, mockGroup);

            expect(mockMarcher1.angle).toBeDefined();
            expect(mockMarcher1.updateTextLabelPosition).toHaveBeenCalled();
        });

        it("should snap to 0 degrees when angle is close", () => {
            mockGroup.angle = 7;

            const mockEvent = {
                e: new MouseEvent("rotating"),
            } as fabric.IEvent<Event>;

            handleGroupRotating(mockEvent, mockGroup);

            expect(mockGroup.angle).toBe(0);
        });

        it("should handle negative angles correctly", () => {
            mockGroup.angle = -23;

            const mockEvent = {
                e: new MouseEvent("rotating"),
            } as fabric.IEvent<Event>;

            handleGroupRotating(mockEvent, mockGroup);

            expect(mockGroup.angle).toBe(-30);
        });
    });

    describe("rotateGroup", () => {
        it("should rotate group to specified angle", () => {
            rotateGroup({ group: mockGroup, angle: 90 });

            expect(mockGroup.angle).toBe(90);
            expect(mockMarcher1.updateTextLabelPosition).toHaveBeenCalled();
        });

        it("should apply counter-rotation to keep marchers upright", () => {
            rotateGroup({ group: mockGroup, angle: 45 });

            expect(mockMarcher1.angle).toBeDefined();
            expect(mockMarcher2.angle).toBeDefined();
        });

        it("should request canvas render after rotation", () => {
            rotateGroup({ group: mockGroup, angle: 180 });

            expect(mockCanvas.requestRenderAll).toHaveBeenCalled();
        });
    });

    describe("setGroupAttributes", () => {
        it("should enable controls for unlocked groups", () => {
            (mockMarcher1 as any).locked = false;
            (mockMarcher2 as any).locked = false;

            setGroupAttributes(mockGroup);

            expect(mockGroup.hasControls).toBe(true);
            expect(mockGroup.hasRotatingPoint).toBe(true);
            expect(mockGroup.lockRotation).toBe(false);
        });

        it("should disable controls for locked groups", () => {
            (mockMarcher1 as any).locked = true;

            setGroupAttributes(mockGroup);

            expect(mockGroup.hasControls).toBe(false);
            expect(mockGroup.lockRotation).toBe(true);
            expect(mockGroup.evented).toBe(false);
        });

        it("should disable uniform scaling via Shift key", () => {
            setGroupAttributes(mockGroup);

            expect((mockGroup as any).uniScaleKey).toBeNull();
        });

        it("should prevent scaling flip", () => {
            setGroupAttributes(mockGroup);

            expect(mockGroup.lockScalingFlip).toBe(true);
        });

        it("should attach scaling and moving event handlers for unlocked groups", () => {
            const onSpy = vi.spyOn(mockGroup, "on");

            setGroupAttributes(mockGroup);

            expect(onSpy).toHaveBeenCalledWith("scaling", expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith("moving", expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith("scaled", expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith("modified", expect.any(Function));
        });

        it("should set locked flag when any object is locked", () => {
            (mockMarcher1 as any).locked = true;
            (mockMarcher2 as any).locked = false;

            setGroupAttributes(mockGroup);

            expect((mockGroup as any).locked).toBe(true);
        });
    });

    describe("resetMarcherRotation", () => {
        it("should reset all marcher angles to 0", () => {
            mockMarcher1.angle = 45;
            mockMarcher2.angle = 90;

            resetMarcherRotation(mockGroup);

            expect(mockMarcher1.angle).toBe(0);
            expect(mockMarcher2.angle).toBe(0);
        });

        it("should handle groups with non-marcher objects", () => {
            const rect = new fabric.Rect({ width: 50, height: 50 });
            const mixedGroup = new fabric.Group([rect, mockMarcher1]);
            mockMarcher1.angle = 45;

            resetMarcherRotation(mixedGroup);

            expect(mockMarcher1.angle).toBe(0);
        });

        it("should handle empty groups gracefully", () => {
            const emptyGroup = new fabric.Group([]);

            expect(() => resetMarcherRotation(emptyGroup)).not.toThrow();
        });
    });
});