import { fabric } from "fabric";
import type {
    ControlPointConfig,
    GlobalControlPoint,
    Point,
} from "../../../interfaces";

export default class FabricControlPoint extends fabric.Rect {
    constructor(
        controlPointObj: GlobalControlPoint,
        onMove: (point: Point) => void,
        canvas: fabric.Canvas,
        config?: ControlPointConfig,
    ) {
        super({
            width: config?.controlPointProps.size || 16,
            height: config?.controlPointProps.size || 16,
            originX: "center",
            originY: "center",
            left: controlPointObj.point.x,
            top: controlPointObj.point.y,
            fill: config?.controlPointProps.color || "white",
            stroke: config?.controlPointProps.stroke || "red",
            strokeWidth: config?.controlPointProps.strokeWidth || 4,
            hasControls: false,
            ...config,
        });
        canvas.add(this);
        canvas.requestRenderAll();

        this.on("moving", () => onMove(this.getCenterPoint()));
    }
}
