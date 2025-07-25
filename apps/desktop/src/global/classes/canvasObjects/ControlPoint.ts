import { fabric } from "fabric";
import { ControlPoint as IControlPoint, Point } from "@openmarch/path-utility";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { rgbaToString } from "../FieldTheme";

export class ControlPoint extends fabric.Circle {
    private _canvas: OpenMarchCanvas;
    private _controlPoint: IControlPoint;
    private _onMove: (id: string, newPoint: Point) => void;

    constructor(
        controlPoint: IControlPoint,
        canvas: OpenMarchCanvas,
        onMove: (id: string, newPoint: Point) => void,
    ) {
        super({
            strokeWidth: 4,
            radius: 6,
            fill: "#fff",
            stroke: rgbaToString(canvas.fieldProperties.theme.shape),
            hasBorders: false,
            originX: "center",
            originY: "center",
            hasControls: false,
            hoverCursor: "pointer",
            left: controlPoint.point.x,
            top: controlPoint.point.y,
        });

        this._controlPoint = controlPoint;
        this._canvas = canvas;
        this._onMove = onMove;

        this.on("moving", this._onMoving);
    }

    private _onMoving() {
        if (!this.left || !this.top) return;

        const newPoint: Point = { x: this.left, y: this.top };
        this._onMove(this._controlPoint.id, newPoint);
    }

    public destroy() {
        this._canvas.remove(this);
    }
}
