import { fabric } from "fabric";
import type {
    GlobalControlPoint,
    Point,
    PointProps,
} from "../../../interfaces";

export default class FabricControlPoint extends fabric.Rect {
    constructor(
        controlPointObj: GlobalControlPoint,
        onMove: (point: Point) => void,
        canvas: fabric.Canvas,
        config?: PointProps,
    ) {
        super({
            width: config?.size || 16,
            height: config?.size || 16,
            originX: "center",
            originY: "center",
            left: controlPointObj.point.x,
            top: controlPointObj.point.y,
            fill: config?.fill || "white",
            stroke: config?.stroke || "red",
            strokeWidth: config?.strokeWidth || 4,
            hasControls: false,
            data: {
                type: "controlPoint",
                segmentIndex: controlPointObj.segmentIndex,
                pointIndex: controlPointObj.pointIndex,
            },
            ...config,
        });
        canvas.add(this);
        canvas.requestRenderAll();

        this.on("moving", () => onMove(this.getCenterPoint()));
    }
}
