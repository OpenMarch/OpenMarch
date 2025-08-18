import {
    ControlPointManager,
    GlobalControlPoint,
    Line,
    Path,
    type Point,
} from "@openmarch/path-utility";
import { fabric } from "fabric";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { FieldTheme, rgbaToString } from "@openmarch/core";
import { MarcherPage } from "@/hooks/queries/useMarcherPages";
import { marcherPagesToPath } from "../MarcherPage";
import { db } from "@/global/database/db";
import { incrementUndoGroup } from "../History";
import {
    NewSectionAppearanceArgs,
    SectionAppearance,
} from "../SectionAppearance";

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
    static createPathway = (pathObj: Path, marcherPageId: number): unknown => {
        db.transaction(async (tx) => {
            console.log("asdf");
        });
        console.warn("createPathway unimplemented");
        return undefined;
    };
    static updatePathway = (pathId: number, pathObj: Path): unknown => {
        console.warn("updatePathway unimplemented");
        return undefined;
    };

    static async createSectionAppearances(
        newAppearances: NewSectionAppearanceArgs[],
    ): Promise<SectionAppearance[]> {
        console.log("asdfCreateSectionAppearances");
        await new Promise((resolve) => setTimeout(resolve, 10));
        return await db.transaction(async (tx) => {
            console.log("createSectionAppearances");
            await incrementUndoGroup(tx);

            // const results = await tx
            //     .insert(section_appearances)
            //     .values(newAppearances.map(createDatabaseSectionAppearance))
            //     .returning()
            //     .all();

            // return results.map((row) => new SectionAppearance(row));
            return [];
        });
    }

    private _getFabricControlPoints() {
        return this.controlPoints.map(
            (cp) =>
                new FabricControlPoint(
                    cp,
                    (e, newPoint: Point) => {
                        this._controlPointManager.moveControlPoint(
                            cp.id,
                            newPoint,
                        );
                    },
                    (e, newPoint: Point) => {
                        // Add a small delay to ensure any previous transactions are complete
                        // This is needed to trigger database transactions from fabric callbacks
                        new Promise((resolve) => setTimeout(resolve, 10)).then(
                            () => {
                                if (!this._nextMarcherPage) {
                                    return;
                                }
                                if (
                                    this._nextMarcherPage.path_data &&
                                    this._nextMarcherPage.path_data_id
                                ) {
                                    EditablePath.updatePathway(
                                        this._nextMarcherPage.path_data_id,
                                        this._pathObj,
                                    );
                                } else {
                                    EditablePath.createPathway(
                                        this._pathObj,
                                        this._nextMarcherPage.id,
                                    );
                                }
                            },
                        );
                    },
                    this._fieldTheme,
                ),
        );
    }

    // updateMouseUpCallback(
    //     onMouseUp: (e: fabric.IEvent<MouseEvent>, point: Point) => void,
    // ) {
    //     this._fabricControlPoints.forEach((cp) =>
    //         cp.updateMouseUpCallback(onMouseUp),
    //     );
    // }

    private _resetControlPointManager() {
        this._controlPointManager = new ControlPointManager(this.pathObj);
        this._controlPointManager.addMoveCallback(() => {
            // The path object is now mutated, so we just need to update the fabric object.
            this.updatePath();
        });
        this._fabricControlPoints = this._getFabricControlPoints();
    }

    updateMarcherPages(marcherPage: MarcherPage, nextMarcherPage: MarcherPage) {
        this._marcherPage = marcherPage;
        this._nextMarcherPage = nextMarcherPage;

        this._pathObj =
            this._nextMarcherPage.path_data ??
            marcherPagesToPath({
                startMarcherPage: this._marcherPage,
                endMarcherPage: this._nextMarcherPage,
            });

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
        this.pathObj = pathObj;

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
