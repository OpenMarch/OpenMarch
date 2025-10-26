import { fabric } from "fabric";
import * as Selectable from "./interfaces/Selectable";
import { Prop, PropPage } from "@/db-functions";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { DEFAULT_FIELD_THEME, FieldTheme, rgbaToString } from "@openmarch/core";
import { PropPageOriginXOptions } from "@/db-functions/propPage";
import { PropPageOriginYOptions } from "@/db-functions/propPage";

export default class PropManager {
    readonly classString = Selectable.SelectableClasses.PROP;
    readonly locked = false;
    readonly lockedReason = "";

    readonly id: number;
    canvas: OpenMarchCanvas;
    private _propPolygon: PropPolygon;
    private _propOriginCircle: fabric.Circle;
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
        this.canvas = canvas;
        this._propObj = propObj;
        this.id = this._propObj.id;
        this._propPageCurrent = propPageCurrent;
        this._propPolygon = new PropPolygon({
            points: propPageCurrent.relative_points,
            fieldTheme: canvas.fieldProperties.theme,
            coordinate: { x: propPageCurrent.x, y: propPageCurrent.y },
            options: propPageCurrent.properties,
            originX: propPageCurrent.origin_x,
            originY: propPageCurrent.origin_y,
        });
        this._propOriginCircle = new fabric.Circle({
            radius: 5,
            fill: rgbaToString(canvas.fieldProperties.theme.defaultPropStroke),
            originX: "center",
            originY: "center",
            left: propPageCurrent.x,
            top: propPageCurrent.y,
        });
        canvas.add(this._propPolygon);
        canvas.add(this._propOriginCircle);
        this.hideOriginCircle();
    }

    get propPageCurrent() {
        return this._propPageCurrent;
    }

    updatePropPageCurrent(newPropPageCurrent: PropPage) {
        this._propPolygon.updatePoints(newPropPageCurrent.relative_points);
        this._propPolygon.updatePosition({
            x: newPropPageCurrent.x,
            y: newPropPageCurrent.y,
        });
        this._propPolygon.updateProperties({
            ...newPropPageCurrent.properties,
            originX: newPropPageCurrent.origin_x,
            originY: newPropPageCurrent.origin_y,
        });
        this.canvas.requestRenderAll();
        this._propPageCurrent = newPropPageCurrent;
    }

    setIsSelected(isSelected: boolean) {
        if (isSelected) {
            this.showOriginCircle();
        } else {
            this.hideOriginCircle();
        }
    }

    hideOriginCircle() {
        this._propOriginCircle.visible = false;
        this.canvas.requestRenderAll();
    }

    showOriginCircle() {
        this._propOriginCircle.visible = true;
        this.canvas.requestRenderAll();
    }

    hide() {
        this._propPolygon.visible = false;
        this._propOriginCircle.visible = false;
        this.canvas.requestRenderAll();
    }

    show() {
        this._propPolygon.visible = true;
        this._propOriginCircle.visible = true;
        this.canvas.requestRenderAll();
    }

    destroy() {
        this.canvas.remove(this._propPolygon);
        this.canvas.remove(this._propOriginCircle);
        // this.canvas.remove(this._fabricText);
    }
}

class PropPolygon extends fabric.Polygon {
    constructor({
        points,
        originX,
        originY,
        coordinate,
        options,
        fieldTheme,
    }: {
        points: [number, number][];
        originX: (typeof PropPageOriginXOptions)[number];
        originY: (typeof PropPageOriginYOptions)[number];
        coordinate: { x: number; y: number };
        options?: fabric.IPolylineOptions;
        fieldTheme?: FieldTheme;
    }) {
        super(
            points.map((point) => ({ x: point[0], y: point[1] })),
            {
                fill: rgbaToString(
                    fieldTheme?.defaultPropFill ??
                        DEFAULT_FIELD_THEME.defaultPropFill,
                ),
                strokeWidth: 2,
                stroke: rgbaToString(
                    fieldTheme?.defaultPropStroke ??
                        DEFAULT_FIELD_THEME.defaultPropStroke,
                ),
                objectCaching: true,
                hasControls: false,
                originX,
                originY,
                borderScaleFactor: 2,
                ...options,
                left: coordinate.x,
                top: coordinate.y,
            },
        );
    }

    updatePoints(points: [number, number][]) {
        this.points = points.map(
            (point) => new fabric.Point(point[0], point[1]),
        );
        this.setCoords();
        this.canvas?.requestRenderAll();
    }

    updatePosition(position: { x: number; y: number }) {
        this.left = position.x;
        this.top = position.y;
        this.setCoords();
        this.canvas?.requestRenderAll();
    }

    updateProperties(properties: fabric.IPolylineOptions) {
        for (const key in properties) {
            this[key as keyof fabric.IPolylineOptions] =
                properties[key as keyof fabric.IPolylineOptions];
        }
        this.setCoords();
        this.canvas?.requestRenderAll();
    }
}
