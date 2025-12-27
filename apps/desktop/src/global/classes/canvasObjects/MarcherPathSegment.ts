import { fabric } from "fabric";
import { IControllableSegment } from "@openmarch/core";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { rgbaToString } from "@openmarch/core";

export class MarcherPathSegment {
    private _segment: IControllableSegment;
    private _canvas: OpenMarchCanvas;
    private _fabricObject: fabric.Object;

    constructor(segment: IControllableSegment, canvas: OpenMarchCanvas) {
        this._segment = segment;
        this._canvas = canvas;
        this._fabricObject = this._createFabricObject();
    }

    private _createFabricObject(): fabric.Object {
        return new fabric.Path(this._segment.toSvgString(true), {
            stroke: rgbaToString(this._canvas.fieldProperties.theme.shape),
            strokeWidth: 4,
            fill: "transparent",
            selectable: false,
            evented: false,
        });
    }

    public render() {
        this._canvas.add(this._fabricObject);
    }

    public destroy() {
        this._canvas.remove(this._fabricObject);
    }
}
