import {
    ControlPointManager,
    GlobalControlPoint,
    Line,
    Path,
    type Point,
} from "@openmarch/core";
import { fabric } from "fabric";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { FieldTheme, rgbaToString } from "@openmarch/core";
import MarcherPage from "../MarcherPage";
import { db } from "@/global/database/db";

export default class EditablePath {
    private _marcherPage?: MarcherPage;
    private _nextMarcherPage?: MarcherPage;
    private _pathObj: Path;
    private _fabricPath: fabric.Path;
    private _controlPointManager: ControlPointManager;
    private _fabricControlPoints: FabricControlPoint[];
    private _fieldTheme: FieldTheme;

    constructor({
        pathOptions,
        fieldTheme,
    }: {
        pathOptions?: fabric.IPathOptions;
        fieldTheme: FieldTheme;
    }) {
        this._fieldTheme = fieldTheme;

        // temp placeholder path
        this._pathObj = new Path([new Line({ x: 0, y: 0 }, { x: 0, y: 0 })]);

        this._fabricPath = new fabric.Path(this._pathObj.toSvgString(), {
            selectable: false,
            width: 1000,
            height: 1000,
            stroke: rgbaToString(fieldTheme?.nextPath) ?? "green",
            strokeWidth: 2,
            fill: "transparent",
            ...pathOptions,
        });

        this._controlPointManager = new ControlPointManager(this.pathObj);
        this._controlPointManager.addMoveCallback(() => {
            // The path object is now mutated, so we just need to update the fabric object.
            this.updatePath();
        });

        this._fabricControlPoints = this._getFabricControlPoints();
    }

    private async _triggerPathUpdate() {
        if (!this._nextMarcherPage) {
            return;
        }
        this.updatePath();
        // This MUST be remembered before creating the promise, otherwise, the path will be the old object
        const newPathObj = this.pathObj;
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (this._nextMarcherPage.path_data_id) {
            EditablePath.updatePathway(
                this._nextMarcherPage.path_data_id,
                newPathObj,
            );
        } else {
            EditablePath.createPathway(newPathObj, this._nextMarcherPage.id);
        }
    }

    static createPathway = (
        _pathObj: Path,
        _marcherPageId: number,
    ): unknown => {
        console.warn("createPathway unimplemented");
        return undefined;
    };

    static updatePathway = (_pathId: number, _pathObj: Path): unknown => {
        console.warn("updatePathway unimplemented");
        return undefined;
    };

    private _getFabricControlPoints() {
        return this.controlPoints.map(
            (cp) =>
                new FabricControlPoint(
                    cp,
                    (_e, newPoint: Point) => {
                        this._controlPointManager.moveControlPoint(
                            cp.id,
                            newPoint,
                        );
                    },
                    (_e, _newPoint: Point) => {
                        void this._triggerPathUpdate();
                    },
                    this._fieldTheme,
                ),
        );
    }

    private _resetControlPointManager() {
        this._controlPointManager = new ControlPointManager(this.pathObj);
        this._controlPointManager.addMoveCallback(() => {
            // The path object is now mutated, so we just need to update the fabric object.
            this.updatePath();
        });
        this._fabricControlPoints = this._getFabricControlPoints();
    }

    updatePathwayWithMarcherPages(
        marcherPage: MarcherPage,
        nextMarcherPage: MarcherPage,
    ) {
        this._marcherPage = marcherPage;
        this._nextMarcherPage = nextMarcherPage;

        // this._pathObj =
        //     newPathObj ??
        //     marcherPagesToPath({
        //         startMarcherPage: this._marcherPage,
        //         endMarcherPage: this._nextMarcherPage,
        //     });

        this._resetControlPointManager();
        this.updatePath();
    }

    get pathObj(): Path {
        return this._pathObj;
    }

    /**
     * Set the path object and update the fabric object.
     */
    set pathObj(pathObj: Path) {
        this._pathObj = pathObj;

        this._resetControlPointManager();
        this.updatePath();
    }

    get controlPoints(): GlobalControlPoint[] {
        return this._controlPointManager.getAllControlPoints();
    }

    updatePath() {
        if (this._fabricPath) {
            // Use fabric's utility to parse the SVG string into path commands
            const newPathCommands = (fabric.util as any).parsePath(
                this._pathObj.toSvgString(),
            );

            // Set the new path commands on the existing fabric object
            this._fabricPath.objectCaching = false;
            this._fabricPath.set("path", newPathCommands);

            // Tell fabric to recalculate the object's dimensions and position
            this._fabricPath.setCoords();
            this._fabricPath.calcOwnMatrix();

            // Request a re-render of the canvas
            this._fabricPath.canvas?.requestRenderAll();
        }
    }

    getFabricObjects({
        renderLastControlPoint = false,
        renderFirstControlPoint = false,
    }: {
        renderLastControlPoint?: boolean;
        renderFirstControlPoint?: boolean;
    } = {}): fabric.Object[] {
        const output: fabric.Object[] = [this._fabricPath];

        const controlPoints = this._fabricControlPoints.filter(
            (cp) => cp.visible,
        );
        if (!renderLastControlPoint) {
            const lastCoord = controlPoints.pop();
            if (lastCoord) {
                output.push(
                    new fabric.Circle({
                        radius: 4,
                        originX: "center",
                        originY: "center",
                        left: lastCoord.left,
                        top: lastCoord.top,
                    }),
                );
            }
        }
        if (!renderFirstControlPoint) {
            const firstCoord = controlPoints.shift();
            if (firstCoord) {
                output.push(
                    new fabric.Circle({
                        radius: 4,
                        originX: "center",
                        originY: "center",
                        left: firstCoord.left,
                        top: firstCoord.top,
                    }),
                );
            }
        }
        output.push(...controlPoints);

        return output;
    }
}

class FabricControlPoint extends fabric.Circle {
    private _controlPointObj: GlobalControlPoint;
    canvas?: OpenMarchCanvas;

    constructor(
        controlPointObj: GlobalControlPoint,
        onMove: (e: fabric.IEvent<MouseEvent>, point: Point) => void,
        onMouseUp: (e: fabric.IEvent<MouseEvent>, point: Point) => void,
        fieldTheme: FieldTheme,
        config?: fabric.ICircleOptions,
    ) {
        super({
            radius: 10,
            originX: "center",
            originY: "center",
            left: controlPointObj.point.x,
            top: controlPointObj.point.y,
            fill: "white",
            stroke: rgbaToString(fieldTheme.nextPath),
            hasControls: false,
            ...config,
        });
        this._controlPointObj = controlPointObj;

        this.on("moving", (e) => onMove(e, this.getCenterPoint()));
        this.on("mouseup", (e) => onMouseUp(e, this.getCenterPoint()));
    }

    // updateMouseUpCallback(
    //     onMouseUp: (e: fabric.IEvent<MouseEvent>, point: Point) => void,
    // ) {
    //     this.off("mouseup");
    //     this.on("mouseup", (e) => onMouseUp(e, this.getCenterPoint()));
    // }
}
