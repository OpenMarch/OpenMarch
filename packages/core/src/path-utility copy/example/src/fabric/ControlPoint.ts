import { fabric } from "fabric";
import { type GlobalControlPoint, type Point } from "@openmarch/core";

export default class FabricControlPoint extends fabric.Rect {
    constructor(
        controlPointObj: GlobalControlPoint,
        onMove: (point: Point) => void,
        canvas: fabric.Canvas,
        config?: fabric.ICircleOptions,
    ) {
        super({
            width: 16,
            height: 16,
            originX: "center",
            originY: "center",
            left: controlPointObj.point.x,
            top: controlPointObj.point.y,
            fill: "white",
            stroke: "red",
            strokeWidth: 4,
            hasControls: false,
            ...config,
        });
        canvas.add(this);
        canvas.requestRenderAll();

        this.on("moving", () => onMove(this.getCenterPoint()));
    }
}
