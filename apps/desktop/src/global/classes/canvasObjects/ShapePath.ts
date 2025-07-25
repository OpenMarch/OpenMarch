import { fabric } from "fabric";
import { ShapePoint } from "./ShapePoint";
import { VanillaPoint } from "./StaticMarcherShape";
import {
    FieldTheme,
    DEFAULT_FIELD_THEME,
    rgbaToString,
} from "@openmarch/core/field";

/**
 * The fabric.Path object that represents the path of the shape.
 */
export class ShapePath extends fabric.Path {
    static fieldTheme: FieldTheme = DEFAULT_FIELD_THEME;

    /**
     * @param points The points to draw the path from
     */
    constructor(points: ShapePoint[]) {
        super(ShapePoint.pointsToString(points), {
            fill: "",
            strokeWidth: 2,
            stroke: rgbaToString(ShapePath.fieldTheme.shape),
            objectCaching: true,
            hasControls: false,
            borderColor: "#0d6efd",
            borderScaleFactor: 2,
        });
        this.disableControl();
    }

    enableControl() {
        this.stroke = rgbaToString(ShapePath.fieldTheme.shape);
        this.strokeWidth = 2;
        this.strokeDashArray = [];
        this.selectable = true;
        this.backgroundColor = rgbaToString({
            ...ShapePath.fieldTheme.tempPath,
            a: 0.2,
        });
        this.hoverCursor = "move";
    }

    disableControl() {
        this.stroke = rgbaToString(ShapePath.fieldTheme.tempPath);
        this.strokeWidth = 1;
        this.strokeDashArray = [5, 3];
        this.selectable = false;
        this.backgroundColor = "transparent";
        this.hoverCursor = "default";
    }

    get points(): ShapePoint[] {
        if (!this.path) {
            console.error("The path is not defined");
            return [];
        }
        return ShapePoint.fromArray(this.path as any as VanillaPoint[]);
    }

    /**
     * String representation of all the points in the path.
     *
     * @returns A string representation of the path. E.g. "M 0 0 L 100 100"
     */
    toString() {
        return this.points.map((point) => point.toString()).join(" ");
    }

    equals(other: ShapePath) {
        return this.toString() === other.toString();
    }
}
