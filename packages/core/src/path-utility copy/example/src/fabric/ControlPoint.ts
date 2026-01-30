import { fabric } from "fabric";
import { type GlobalControlPoint, type Point } from "@openmarch/core";

export default class FabricControlPoint extends fabric.Circle {
    constructor(
        controlPointObj: GlobalControlPoint,
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
            hasControls: false,
            ...config,
        });
        canvas.add(this);
        canvas.requestRenderAll();

        this.on("moving", () => onMove(this.getCenterPoint()));
    }
}
