import { fabric } from "fabric";
import { type ControlPoint, type Point } from "@openmarch/path-utility";

export default class FabricControlPoint extends fabric.Circle {
    private _controlPointObj: ControlPoint;
    private _canvas: fabric.Canvas;

    constructor(
        controlPointObj: ControlPoint,
        onMove: (point: Point) => void,
        canvas: fabric.Canvas,
        config?: fabric.ICircleOptions,
    ) {
        super({
            radius: 10,
            originX: "center",
            originY: "center",
            left: controlPointObj.point.x,
            top: controlPointObj.point.y,
            fill: "red",
            ...config,
        });
        this._controlPointObj = controlPointObj;
        this._canvas = canvas;
        canvas.add(this);
        canvas.requestRenderAll();

        this.on("moving", () => onMove(this.getCenterPoint()));
    }
}
