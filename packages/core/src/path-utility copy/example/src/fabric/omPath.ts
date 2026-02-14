import { Path, type ControlPointConfig } from "../../../../path-utility copy";
import { fabric } from "fabric";
import {
    CONTROL_POINT,
    createFabricControlPoint,
    createFabricSplitPoint,
    SPLIT_POINT,
} from "./ControlPoint";

const numberOfChildren = 20;

export default class OmPath<T extends fabric.Canvas> {
    protected _pathObj: Path;
    protected _fabricPath: fabric.Path;
    protected _canvas: T;
    protected _children: fabric.Object[] = [];
    protected _fabricControlPoints: fabric.Object[] = [];
    protected _midSegmentPoints: fabric.Object[][] = [];

    protected _controlPointConfig: ControlPointConfig;
    protected _moveUnsubscribes: (() => void)[] = [];
    protected _countUnsubscribes: (() => void)[] = [];
    protected _segmentChangeUnsubscribes: (() => void)[] = [];

    protected _pendingControlPointDrag: {
        segmentIndex: number;
        pointIndex: number;
    } | null = null;
    protected _handlePendingMove = (e: fabric.IEvent<MouseEvent>) => {
        if (!this._pendingControlPointDrag) return;
        const pointer = this._canvas.getPointer(e.e);
        const { segmentIndex, pointIndex } = this._pendingControlPointDrag;
        this.pathObj.updateSegmentControlPoint(segmentIndex, pointIndex, [
            pointer.x,
            pointer.y,
        ]);
        this.updatePath();
        const fabricControlPoint = this._fabricControlPoints.find(
            (fp) =>
                fp.data?.segmentIndex === segmentIndex &&
                fp.data?.pointIndex === pointIndex,
        );
        if (fabricControlPoint) {
            fabricControlPoint.set({
                left: pointer.x,
                top: pointer.y,
            });
            fabricControlPoint.setCoords();
            this._canvas.requestRenderAll();
        }
    };
    protected _handlePendingUp = () => {
        this._pendingControlPointDrag = null;
        this._canvas.off("mouse:move", this._handlePendingMove as any);
        this._canvas.off("mouse:up", this._handlePendingUp as any);
        this._canvas.selection = true;
    };

    constructor(
        pathObj: Path,
        canvas: T,
        config: ControlPointConfig,
        pathOptions?: fabric.IPathOptions,
    ) {
        this._pathObj = pathObj;
        const onPathOrSegmentChange = () => {
            this.rewireSegmentSubscriptions();
            this.createControlPoints();
            this.createSplitPoints();
            this.updatePath();
        };
        for (const segment of pathObj.segments) {
            const unsubscribeFromMove = segment.subscribeToMove(() => {
                this.updatePath();
            });
            this._moveUnsubscribes.push(unsubscribeFromMove);

            const unsubscribeCount = segment.subscribeToCount(() => {
                this.createControlPoints();
                this.createSplitPoints();
                this.updatePath();
            });
            this._countUnsubscribes.push(unsubscribeCount);
        }
        const unsubscribeFromSegmentChange = pathObj.subscribeToChange(
            onPathOrSegmentChange,
        );
        this._segmentChangeUnsubscribes.push(unsubscribeFromSegmentChange);
        this._fabricPath = new fabric.Path(pathObj.toSvgString(), {
            selectable: false,
            width: 1000,
            height: 1000,
            fill: "transparent",
            stroke: "black",
            strokeWidth: 2,
            ...pathOptions,
        });
        this._canvas = canvas;
        this._canvas.on("mouse:down", this.mouseDownCanvasEventFunction);
        this._canvas.on(
            "mouse:dblclick",
            this.mouseDoubleClickCanvasEventFunction,
        );
        this._canvas.on("mouse:up", this.mouseUpCanvasEventFunction);
        canvas.add(this._fabricPath);
        canvas.requestRenderAll();

        const coordinates =
            this._pathObj.getEvenlySpacedPoints(numberOfChildren);

        for (let i = 0; i < numberOfChildren; i++) {
            const pt = coordinates[i]!;
            const child = new fabric.Circle({
                radius: 5,
                fill: "red",
                originX: "center",
                originY: "center",
                left: pt[0]!,
                top: pt[1],
            });
            this._children.push(child);
            canvas.add(child);
        }

        this._controlPointConfig = config;
        this.createControlPoints();
        this.createSplitPoints();
        canvas.requestRenderAll();
    }

    /**
     * Unsubscribes from previous segments and subscribes to the path's current
     * segments. Call this when the path's segment list may have changed (e.g.
     * after changeTypeFromSplitPoint), so new segments get move/count listeners.
     */
    protected rewireSegmentSubscriptions(): void {
        for (const unsubscribe of this._moveUnsubscribes) unsubscribe();
        this._moveUnsubscribes = [];
        for (const unsubscribe of this._countUnsubscribes) unsubscribe();
        this._countUnsubscribes = [];
        for (const segment of this._pathObj.segments) {
            this._moveUnsubscribes.push(
                segment.subscribeToMove(() => this.updatePath()),
            );
            this._countUnsubscribes.push(
                segment.subscribeToCount(() => {
                    this.createControlPoints();
                    this.createSplitPoints();
                    this.updatePath();
                }),
            );
        }
    }

    /**
     * Deletes the current control points and creates new ones.
     */
    protected createControlPoints(): void {
        for (const controlPoint of this._fabricControlPoints) {
            this._canvas.remove(controlPoint);
        }
        this._fabricControlPoints = [];

        const worldControlPoints = this.pathObj.worldControlPointsWithData();

        for (const [
            segmentIndex,
            segmentControlPoints,
        ] of worldControlPoints.entries()) {
            for (const [
                pointIndex,
                worldControlPoint,
            ] of segmentControlPoints.entries()) {
                if (segmentIndex > 0 && pointIndex === 0) continue;
                const fp = createFabricControlPoint({
                    controlPointObj: {
                        ...worldControlPoint,
                        segmentIndex,
                    },
                    onMove: (newPoint) => {
                        this.pathObj.updateSegmentControlPoint(
                            segmentIndex,
                            pointIndex,
                            newPoint,
                        );
                    },
                    type: worldControlPoint.type,
                    config: this._controlPointConfig!.controlPointProps,
                });
                this._fabricControlPoints.push(fp);
                this._canvas.add(fp);
            }
        }
        this._canvas.requestRenderAll();
    }

    protected createSplitPoints(): void {
        const config = this._controlPointConfig.splitPointProps;

        // Remove old split points from canvas before rebuilding
        for (const pointsInSegment of this._midSegmentPoints) {
            for (const fp of pointsInSegment) {
                this._canvas.remove(fp);
            }
        }
        this._midSegmentPoints = [];
        for (let i = 0; i < this.pathObj.segments.length; i++)
            this._midSegmentPoints.push([]);

        for (const [segmentIndex, pointsInSegment] of this.pathObj
            .getSplitPoints()
            .entries()) {
            for (const [
                splitPointIndex,
                splitPoint,
            ] of pointsInSegment.entries()) {
                const fp = createFabricSplitPoint({
                    splitPointObj: {
                        point: splitPoint.point,
                        segmentIndex,
                        splitPointIndex,
                    },
                    type: splitPoint.type,
                    config: config!,
                });

                this._midSegmentPoints[segmentIndex].push(fp);
                this._canvas.add(fp);
            }
        }
        this._canvas.requestRenderAll();
    }

    /**
     * Moves the split points to their appropriate positions.
     * @note does not request a render
     */
    protected moveSplitPoints(): void {
        for (const [segmentIndex, pointsInSegment] of this.pathObj
            .getSplitPoints()
            .entries()) {
            for (const [pointIndex, splitPoint] of pointsInSegment.entries()) {
                const fp = this._midSegmentPoints[segmentIndex][pointIndex]!;
                fp.set("left", splitPoint.point[0]);
                fp.set("top", splitPoint.point[1]);
                fp.setCoords();
            }
        }
    }

    get canvas(): T {
        return this._canvas;
    }

    get pathObj(): Path {
        return this._pathObj;
    }

    set pathObj(pathObj: Path) {
        this._pathObj = pathObj;
        this.updatePath();
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

            const coordinates =
                this._pathObj.getEvenlySpacedPoints(numberOfChildren);

            for (let i = 0; i < numberOfChildren; i++) {
                const pt = coordinates[i]!;
                const child = this._children[i]!;
                child.set("left", pt[0]);
                child.set("top", pt[1]);
                child.setCoords();
            }
            this.moveSplitPoints();

            // Request a re-render of the canvas
            this._canvas.requestRenderAll();
        }
    }

    /**
     * Hides the path by removing it from the canvas.
     */
    hide() {
        if (this._pendingControlPointDrag) {
            this._pendingControlPointDrag = null;
            this._canvas.off("mouse:move", this._handlePendingMove as any);
            this._canvas.off("mouse:up", this._handlePendingUp as any);
            this._canvas.selection = true;
        }
        if (this._fabricPath) this._canvas.remove(this._fabricPath);
    }

    /**
     * Adds the path to the canvas.
     */
    addToCanvas() {
        this._canvas.add(this._fabricPath);
    }

    // ********************* EVENT HANDLERS *********************

    protected mouseDownCanvasEventFunction = (e: fabric.IEvent<MouseEvent>) => {
        const isLeftClick = e.e.button === 0;
        const shiftKey = e.e.shiftKey;
        if (e.target && e.target.data?.segmentIndex != null) {
            const segmentIndex = e.target.data.segmentIndex;
            if (isLeftClick) {
                if (shiftKey) {
                    if (e.target.data.type === SPLIT_POINT) {
                        const splitPointIndex = e.target.data.splitPointIndex;
                        this.pathObj.changeTypeFromSplitPoint(
                            segmentIndex,
                            splitPointIndex,
                        );
                    }
                } else {
                    if (e.target.data.type === SPLIT_POINT) {
                        const splitPointIndex = e.target.data.splitPointIndex;
                        this.pathObj.segments[
                            segmentIndex
                        ].createControlPointInBetweenPoints(splitPointIndex);
                        this._pendingControlPointDrag = {
                            segmentIndex,
                            pointIndex: splitPointIndex + 1,
                        };
                        this._canvas.selection = false;
                        this._canvas.on("mouse:move", this._handlePendingMove);
                        this._canvas.on("mouse:up", this._handlePendingUp);
                    }
                }
            }
        }
    };

    protected mouseDoubleClickCanvasEventFunction = (
        e: fabric.IEvent<MouseEvent>,
    ) => {
        if (e.target && e.target.data?.segmentIndex != null) {
            const segmentIndex = e.target.data.segmentIndex;
            if (e.target.data.type === CONTROL_POINT) {
                const pointIndex = e.target.data.pointIndex;
                this.pathObj.segments[segmentIndex].removeControlPoint(
                    pointIndex,
                );
            }
        }
    };

    protected mouseUpCanvasEventFunction = () => {
        this.pathObj.zeroFirstPoint();
        this.updatePath();
    };
}
