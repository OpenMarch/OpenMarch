import { describe, expect, it } from "vitest";
import Marcher from "../../Marcher";
import CanvasMarcher, { DEFAULT_DOT_RADIUS } from "../CanvasMarcher";
import MarcherPage from "../../MarcherPage";
import { fabric } from "fabric";

const marcher1 = new Marcher({
    id: 1,
    name: "Test Marcher",
    section: "Trumpet",
    drill_prefix: "T",
    drill_order: 1,
});

const marcherPage1 = new MarcherPage({
    id: 1,
    id_for_html: "marcher-page-1",
    marcher_id: 1,
    page_id: 1,
    x: 15,
    y: 34,
});
const marcherPage1Alt = new MarcherPage({
    id: 1,
    id_for_html: "marcher-page-1",
    marcher_id: 1,
    page_id: 1,
    x: 23,
    y: 9,
});

const marcherPage2 = new MarcherPage({
    id: 2,
    id_for_html: "marcher-page-2",
    marcher_id: 1,
    page_id: 2,
    x: 23,
    y: 12,
});

const GRID_OFFSET = 0.5;

describe.skip("CanvasMarcher", () => {
    const getCanvasMarcher = (
        params: Partial<ConstructorParameters<typeof CanvasMarcher>[0]> = {},
    ) => {
        const canvas = new fabric.Canvas("test-canvas");
        const marcher = new CanvasMarcher({
            marcher: marcher1,
            marcherPage: marcherPage1,
            ...params,
        });
        marcher.canvas = canvas;
        return marcher;
    };

    describe("constructor", () => {
        it("should set the initial top and left properly", () => {
            const canvasMarcher = getCanvasMarcher();
            expect(canvasMarcher.left).toBe(marcherPage1.x + GRID_OFFSET);
            expect(canvasMarcher.top).toBe(
                marcherPage1.y - getDotOffsetTop(canvasMarcher) + GRID_OFFSET,
            );
        });
        it("should set the marcher properties", () => {
            const canvasMarcherWithDefaultParams = getCanvasMarcher();
            expect(canvasMarcherWithDefaultParams.id).toBe(marcher1.id);
            expect(canvasMarcherWithDefaultParams.marcherObj).toBe(marcher1);
            expect(canvasMarcherWithDefaultParams.coordinate).toBe(
                marcherPage1,
            );
        });
        it("should create the canvas elements", () => {
            const canvasMarcherWithDefaultParams = getCanvasMarcher();

            const circle =
                canvasMarcherWithDefaultParams.getObjects()[0] as fabric.Circle;
            expect(circle.isType("circle")).toBeTruthy();
            expect(circle.radius).toBe(DEFAULT_DOT_RADIUS);

            const text =
                canvasMarcherWithDefaultParams.getObjects()[1] as fabric.Text;
            expect(text.text).toBe(marcher1.drill_number);

            const canvasMarcherWithExplicitParams = getCanvasMarcher({
                color: "green",
                dotRadius: 50,
            });

            const circle2 =
                canvasMarcherWithExplicitParams.getObjects()[0] as fabric.Circle;
            expect(circle2.isType("circle")).toBeTruthy();
            expect(circle2.radius).toBe(50);
            expect(circle2.fill).toBe("green");
        });
    });

    describe("isCanvasMarcher", () => {
        it("should return true if the given object is a canvas marcher", () => {
            const canvasMarcher = getCanvasMarcher();
            expect(CanvasMarcher.isCanvasMarcher(canvasMarcher)).toBeTruthy();
        });
        it("should return false if the given object is not a canvas marcher", () => {
            expect(
                CanvasMarcher.isCanvasMarcher(new fabric.Circle({})),
            ).toBeFalsy();
        });
    });
    describe("setMarcherCoords", () => {
        it("should set the coordinates of the marcher if they have changed", () => {
            const canvasMarcher = getCanvasMarcher();
            const newTopOffset = mockDotOffsetTop(canvasMarcher);
            canvasMarcher.setMarcherCoords(marcherPage1Alt);
            expect(canvasMarcher.left).toBe(marcherPage1Alt.x + GRID_OFFSET);
            expect(canvasMarcher.top).toBe(
                marcherPage1Alt.y + GRID_OFFSET - newTopOffset,
            );
        });
        it("should set the new coordinates relative to the multiselection box if multiple objects are selected and this is one of them", () => {
            const canvasMarcher = getCanvasMarcher();
            const newGroupOffset =
                addMockMultiselectToMarcherCanvasAndGetOffset(canvasMarcher);
            const newTopOffset = mockDotOffsetTop(canvasMarcher);
            canvasMarcher.setMarcherCoords(marcherPage1Alt);
            expect(canvasMarcher.left).toBe(
                marcherPage1Alt.x + GRID_OFFSET - newGroupOffset.x,
            );
            expect(canvasMarcher.top).toBe(
                marcherPage1Alt.y +
                    GRID_OFFSET -
                    newTopOffset -
                    newGroupOffset.y,
            );
        });
        it("should not set the new coordinates relative to the multiselection box if multiple objects are selected and this is not one of them", () => {
            const canvasMarcher = getCanvasMarcher();
            addMockMultiselectToMarcherCanvasAndGetOffset(canvasMarcher, true);
            const newTopOffset = mockDotOffsetTop(canvasMarcher);
            canvasMarcher.setMarcherCoords(marcherPage1Alt);
            expect(canvasMarcher.left).toBe(marcherPage1Alt.x + GRID_OFFSET);
            expect(canvasMarcher.top).toBe(
                marcherPage1Alt.y + GRID_OFFSET - newTopOffset,
            );
        });
    });
    describe("getMarcherCoords", () => {
        it("should convert the coordinates of the marcher to and from the canvas", () => {
            const canvasMarcher = getCanvasMarcher();
            const coords1 = canvasMarcher.getMarcherCoords();
            expect(coords1.x).toBe(marcherPage1.x);
            expect(coords1.y).toBe(marcherPage1.y);
            canvasMarcher.setMarcherCoords(marcherPage1Alt);

            const coords2 = canvasMarcher.getMarcherCoords();
            expect(coords2.x).toBe(marcherPage1Alt.x);
            expect(coords2.y).toBe(marcherPage1Alt.y);
        });
        it("should return the same coordinates regardless of the multiselection box if multiple objects are selected and this is one of them", () => {
            const canvasMarcher = getCanvasMarcher();
            addMockMultiselectToMarcherCanvasAndGetOffset(canvasMarcher);

            const coords = canvasMarcher.getMarcherCoords();
            expect(coords.x).toBe(marcherPage1.x);
            expect(coords.y).toBe(marcherPage1.y);
        });
        it("should return the same coordinates regardless of the multiselection box if multiple objects are selected and this is not one of them", () => {
            const canvasMarcher = getCanvasMarcher();
            addMockMultiselectToMarcherCanvasAndGetOffset(canvasMarcher, true);
            const coords = canvasMarcher.getMarcherCoords();
            expect(coords.x).toBe(marcherPage1.x);
            expect(coords.y).toBe(marcherPage1.y);
        });
    });
    describe("selectable properties", () => {
        it("should be selectable by default", () => {
            const canvasMarcher = getCanvasMarcher();
            expect(canvasMarcher.selectable).toBeTruthy();
            expect(canvasMarcher.hoverCursor).toBe("pointer");
            expect(canvasMarcher.evented).toBeTruthy();
        });
        it("should be set to unselectable when makeUnselectable is called", () => {
            const canvasMarcher = getCanvasMarcher();
            canvasMarcher.makeUnselectable();
            expect(canvasMarcher.selectable).toBeFalsy();
            expect(canvasMarcher.hoverCursor).toBe("default");
            expect(canvasMarcher.evented).toBeFalsy();
        });
        it("should be set back to selectable when makeSelectable is called", () => {
            const canvasMarcher = getCanvasMarcher();
            canvasMarcher.makeUnselectable();
            canvasMarcher.makeSelectable();
            expect(canvasMarcher.selectable).toBeTruthy();
            expect(canvasMarcher.hoverCursor).toBe("pointer");
            expect(canvasMarcher.evented).toBeTruthy();
        });
    });
    describe("setNextAnimation", () => {
        it("should prepare the object for the next frames", () => {
            const canvasMarcher = getCanvasMarcher();
            const newTopOffset = mockDotOffsetTop(canvasMarcher);
            const durationMilliseconds = 1234;

            const startX = canvasMarcher.left;
            const startY = canvasMarcher.top;

            expect(findAnimationsByTarget(canvasMarcher).length).toBe(0);
            canvasMarcher.setNextAnimation({
                marcherPage: marcherPage2,
                durationMilliseconds,
            });

            const runningAnimations = findAnimationsByTarget(canvasMarcher);

            // This has a length of two because we are animating both the top and left properties
            expect(runningAnimations.length).toBe(2);

            // Couldn't work out a way for this to run with mock timers, so we will check the animation properties instead
            expect(runningAnimations[0].startValue).toBe(startX);
            expect(runningAnimations[1].startValue).toBe(startY);

            expect(runningAnimations[0].endValue).toBe(
                marcherPage2.x + GRID_OFFSET,
            );
            expect(runningAnimations[1].endValue).toBe(
                marcherPage2.y + GRID_OFFSET - newTopOffset,
            );

            expect(runningAnimations[0].duration).toBe(durationMilliseconds);
            expect(runningAnimations[1].duration).toBe(durationMilliseconds);
        });
    });
});

function mockDotOffsetTop(canvasMarcher: CanvasMarcher) {
    const circle = canvasMarcher
        .getObjects()
        .find((obj) => obj.type === "circle") as fabric.Circle;

    circle.top = 1;
    return 1;
}

function getDotOffsetTop(canvasMarcher: CanvasMarcher) {
    const circle = canvasMarcher
        .getObjects()
        .find((obj) => obj.type === "circle") as fabric.Circle;

    return circle.top ?? 0;
}
function addMockMultiselectToMarcherCanvasAndGetOffset(
    canvasMarcher: CanvasMarcher,
    excludeCanvasMarcher?: boolean,
): {
    x: number;
    y: number;
} {
    const largeRectangleObject = new fabric.Rect({
        top: 0,
        left: 0,
        width: 100,
        height: 100,
        strokeWidth: 0,
    });
    const smallCircle = new fabric.Circle({
        top: 50,
        left: 23,
        radius: 10,
    });

    const multiselectObject = new fabric.ActiveSelection(
        [
            largeRectangleObject,
            smallCircle,
            ...(excludeCanvasMarcher ? [] : [canvasMarcher]),
        ],
        {
            canvas: canvasMarcher.canvas,
        },
    );

    canvasMarcher.canvas?.setActiveObject(multiselectObject);

    return {
        x: (multiselectObject.left ?? 0) + (multiselectObject.width ?? 0) / 2,
        y: (multiselectObject.top ?? 0) + (multiselectObject.height ?? 0) / 2,
    };
}
function findAnimationsByTarget(targetObject: fabric.Object) {
    return (
        (fabric as any).runningAnimations as {
            target: fabric.Object;
            startValue: number;
            endValue: number;
            duration: number;
        }[]
    ).filter(({ target }) => target === targetObject);
}
