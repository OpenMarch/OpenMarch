import { fabric } from "fabric";
import * as Selectable from "./interfaces/Selectable";
import { Prop, PropPage } from "@/db-functions";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { DEFAULT_FIELD_THEME, FieldTheme, rgbaToString } from "@openmarch/core";

export default class PropManager {
    readonly classString = Selectable.SelectableClasses.PROP;
    readonly locked = false;
    readonly lockedReason = "";

    readonly id: number;
    canvas: OpenMarchCanvas;
    private _propPolygon: PropPolygon;
    // private _fabricText: fabric.Text;
    private _propObj: Prop;
    private _propPageCurrent: PropPage;

    constructor({
        propObj,
        propPageCurrent,
        canvas,
    }: {
        propObj: Prop;
        propPageCurrent: PropPage;
        canvas: OpenMarchCanvas;
    }) {
        this.id = propObj.id;
        this.canvas = canvas;
        this._propObj = propObj;
        this._propPageCurrent = propPageCurrent;
        this._propPolygon = new PropPolygon({
            points: propPageCurrent.relative_points,
            fieldTheme: canvas.fieldProperties.theme,
            coordinate: { x: propPageCurrent.x, y: propPageCurrent.y },
            options: propPageCurrent.properties,
        });
        canvas.add(this._propPolygon);
    }
}

class PropPolygon extends fabric.Polygon {
    constructor({
        points,
        coordinate,
        options,
        fieldTheme,
    }: {
        points: [number, number][];
        coordinate: { x: number; y: number };
        options?: fabric.IPolylineOptions;
        fieldTheme?: FieldTheme;
    }) {
        super(
            points.map((point) => ({ x: point[0], y: point[1] })),
            {
                fill: "#aaaaaa",
                strokeWidth: 2,
                stroke: rgbaToString(
                    fieldTheme?.shape ?? DEFAULT_FIELD_THEME.shape,
                ),
                objectCaching: true,
                hasControls: false,
                borderColor: "#0d6efd",
                borderScaleFactor: 2,
                ...options,
                left: coordinate.x,
                top: coordinate.y,
            },
        );
    }
}
