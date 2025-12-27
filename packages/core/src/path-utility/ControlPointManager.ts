import {
    type IControllableSegment,
    type Point,
    type ControlPointType,
    type ControlPointMoveCallback,
    type ControlPointConfig,
    type GlobalControlPoint,
} from "./interfaces";
import { Path } from "./Path";
import { v4 as uuidv4 } from "uuid";

/**
 * Manages control points for interactive path editing with efficient updates.
 * Only recalculates affected segments when control points are moved.
 */
export class ControlPointManager {
    private _path: Path;
    private _controlPoints: Map<string, GlobalControlPoint> = new Map();
    private _callbacks: ControlPointMoveCallback[] = [];
    private _config: ControlPointConfig;

    constructor(path: Path, config?: Partial<ControlPointConfig>) {
        this._path = path;
        this._config = {
            visible: true,
            handleRadius: 6,
            handleColor: "#4A90E2",
            selectedColor: "#FF6B6B",
            showControlLines: true,
            controlLineColor: "#CCCCCC",
            ...config,
        };
        this.rebuildControlPoints();
    }

    /**
     * Gets the current path instance.
     */
    get path(): Path {
        return this._path;
    }

    /**
     * Gets the current control point configuration.
     */
    get config(): ControlPointConfig {
        return { ...this._config };
    }

    /**
     * Updates the control point configuration.
     */
    updateConfig(config: Partial<ControlPointConfig>): void {
        this._config = { ...this._config, ...config };
    }

    getFirstControlPoint(): GlobalControlPoint | undefined {
        // Find the control point that represents the start of the first segment
        for (const controlPoint of this._controlPoints.values()) {
            if (
                controlPoint.segmentHooks.some(
                    (hook) => hook.segmentIndex === 0 && hook.type === "start",
                )
            ) {
                return controlPoint;
            }
        }
        return undefined;
    }

    getLastControlPoint(): GlobalControlPoint | undefined {
        // Find the control point that represents the end of the last segment
        const lastSegmentIndex = this._path.segments.length - 1;
        if (lastSegmentIndex < 0) return undefined;

        for (const controlPoint of this._controlPoints.values()) {
            if (
                controlPoint.segmentHooks.some(
                    (hook) =>
                        hook.segmentIndex === lastSegmentIndex &&
                        hook.type === "end",
                )
            ) {
                return controlPoint;
            }
        }
        return undefined;
    }

    /**
     * Gets all control points.
     */
    getAllControlPoints({
        excludeFirst = false,
        excludeLast = false,
    }: {
        excludeFirst?: boolean;
        excludeLast?: boolean;
    } = {}): GlobalControlPoint[] {
        let controlPoints = Array.from(this._controlPoints.values());

        let firstPointId: string | undefined;
        let lastPointId: string | undefined;
        if (excludeFirst) {
            firstPointId = this.getFirstControlPoint()?.id;
        }
        if (excludeLast) {
            lastPointId = this.getLastControlPoint()?.id;
        }
        const filteredControlPoints = controlPoints.filter(
            (cp) => cp.id !== firstPointId && cp.id !== lastPointId,
        );
        return filteredControlPoints;
    }

    /**
     * Gets control points for a specific segment.
     */
    getControlPointsForSegment(segmentIndex: number): GlobalControlPoint[] {
        return this.getAllControlPoints().filter((cp) =>
            cp.segmentHooks.some((hook) => hook.segmentIndex === segmentIndex),
        );
    }

    /**
     * Gets a control point by its ID.
     */
    getControlPoint(id: string): GlobalControlPoint | undefined {
        return this._controlPoints.get(id);
    }

    /**
     * Moves a control point to a new position and updates the path efficiently.
     * Only recalculates the affected segment.
     */
    moveControlPoint(controlPointId: string, newPoint: Point): boolean {
        const controlPoint = this._controlPoints.get(controlPointId);
        if (!controlPoint) {
            return false;
        }

        try {
            for (const segmentHook of controlPoint.segmentHooks) {
                const segment = this._path.segments[segmentHook.segmentIndex];
                if (!segment || !this.isControllableSegment(segment)) {
                    continue;
                }
                // Update the segment with the new control point position
                const updatedSegment = segment.updateControlPoint(
                    segmentHook.type,
                    segmentHook.pointIndex,
                    newPoint,
                );

                // Replace the segment in the path
                this.replaceSegment(segmentHook.segmentIndex, updatedSegment);
            }

            // Update the control point in our map
            controlPoint.point = { ...newPoint };

            // Notify callbacks
            this._callbacks.forEach((callback) => {
                try {
                    callback(controlPointId, newPoint);
                } catch (error) {
                    console.error("Error in control point callback:", error);
                }
            });

            return true;
        } catch (error) {
            console.error("Error moving control point:", error);
            return false;
        }
    }

    // /**
    //  * Moves multiple control points at once for batch operations.
    //  */
    // moveControlPoints(updates: Array<{ id: string; point: Point }>): boolean {
    //     const segmentsToUpdate = new Map<number, IControllableSegment>();
    //     const affectedControlPoints = new Map<string, GlobalControlPoint>();

    //     // Group updates by segment and validate all updates first
    //     for (const update of updates) {
    //         const controlPoint = this._controlPoints.get(update.id);
    //         if (!controlPoint) {
    //             console.warn(`Control point ${update.id} not found`);
    //             continue;
    //         }

    //         const segment = this._path.segments[controlPoint.segmentIndex];
    //         if (!segment || !this.isControllableSegment(segment)) {
    //             console.warn(
    //                 `Segment ${controlPoint.segmentIndex} is not controllable`,
    //             );
    //             continue;
    //         }

    //         affectedControlPoints.set(update.id, controlPoint);
    //         if (!segmentsToUpdate.has(controlPoint.segmentIndex)) {
    //             segmentsToUpdate.set(controlPoint.segmentIndex, segment);
    //         }
    //     }

    //     try {
    //         // Update each affected segment
    //         for (const [segmentIndex, originalSegment] of segmentsToUpdate) {
    //             let updatedSegment = originalSegment;

    //             // Apply all updates for this segment
    //             for (const update of updates) {
    //                 const controlPoint = affectedControlPoints.get(update.id);
    //                 if (
    //                     controlPoint &&
    //                     controlPoint.segmentIndex === segmentIndex
    //                 ) {
    //                     updatedSegment = updatedSegment.updateControlPoint(
    //                         controlPoint.type,
    //                         controlPoint.pointIndex,
    //                         update.point,
    //                     );
    //                 }
    //             }

    //             // Replace the segment
    //             this.replaceSegment(segmentIndex, updatedSegment);
    //         }

    //         // Update control points in our map
    //         for (const update of updates) {
    //             const controlPoint = affectedControlPoints.get(update.id);
    //             if (controlPoint) {
    //                 controlPoint.point = { ...update.point };
    //             }
    //         }

    //         // Notify callbacks for each update
    //         for (const update of updates) {
    //             this._callbacks.forEach((callback) => {
    //                 try {
    //                     callback(update.id, update.point);
    //                 } catch (error) {
    //                     console.error(
    //                         "Error in control point callback:",
    //                         error,
    //                     );
    //                 }
    //             });
    //         }

    //         return true;
    //     } catch (error) {
    //         console.error("Error in batch control point update:", error);
    //         return false;
    //     }
    // }

    /**
     * Adds a callback that will be called when control points are moved.
     */
    addMoveCallback(callback: ControlPointMoveCallback): void {
        this._callbacks.push(callback);
    }

    /**
     * Removes a move callback.
     */
    removeMoveCallback(callback: ControlPointMoveCallback): void {
        const index = this._callbacks.indexOf(callback);
        if (index >= 0) {
            this._callbacks.splice(index, 1);
        }
    }

    /**
     * Rebuilds all control points from the current path.
     * Call this when the path structure changes (segments added/removed).
     */
    rebuildControlPoints(): void {
        this._controlPoints.clear();

        const controlPointsByCoordinate: Map<string, GlobalControlPoint> =
            new Map();
        for (const [segmentIndex, segment] of this._path.segments.entries()) {
            if (this.isControllableSegment(segment)) {
                const controlPoints = segment.getControlPoints(segmentIndex);
                for (const [index, controlPoint] of controlPoints.entries()) {
                    const coordinateKey = `${controlPoint.point.x}-${controlPoint.point.y}`;
                    const existingControlPoint =
                        controlPointsByCoordinate.get(coordinateKey);

                    // Cache the control point by coordinate
                    if (existingControlPoint) {
                        // Add the control point to the existing control point
                        existingControlPoint.segmentHooks.push({
                            type: controlPoint.type,
                            pointIndex: index,
                            segmentIndex,
                        });
                    } else {
                        // Create a new control point
                        controlPointsByCoordinate.set(coordinateKey, {
                            id: uuidv4(),
                            point: controlPoint.point,
                            segmentHooks: [
                                {
                                    type: controlPoint.type,
                                    pointIndex: index,
                                    segmentIndex,
                                },
                            ],
                        });
                    }
                }
            }
        }
        this._controlPoints = new Map();
        for (const controlPoint of controlPointsByCoordinate.values())
            this._controlPoints.set(controlPoint.id, controlPoint);
    }

    /**
     * Adds a new segment and rebuilds control points.
     */
    addSegment(segment: IControllableSegment): void {
        this._path.addSegment(segment);
        this.rebuildControlPoints();
    }

    /**
     * Removes a segment and rebuilds control points.
     */
    removeSegment(index: number): boolean {
        const result = this._path.removeSegment(index);
        if (result) {
            this.rebuildControlPoints();
        }
        return result;
    }

    /**
     * Clears all segments and control points.
     */
    clear(): void {
        this._path.clear();
        this._controlPoints.clear();
    }

    /**
     * Gets the distance from a point to the nearest control point.
     * Useful for hit testing in UI.
     */
    getControlPointAt(
        point: Point,
        tolerance: number = 10,
    ): GlobalControlPoint | null {
        let nearest: GlobalControlPoint | null = null;
        let minDistance = tolerance;

        for (const controlPoint of this._controlPoints.values()) {
            const distance = this.getDistance(point, controlPoint.point);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = controlPoint;
            }
        }

        return nearest;
    }

    /**
     * Gets all control points within a certain distance of a point.
     */
    getControlPointsNear(
        point: Point,
        tolerance: number = 10,
    ): GlobalControlPoint[] {
        const nearby: GlobalControlPoint[] = [];

        for (const controlPoint of this._controlPoints.values()) {
            const distance = this.getDistance(point, controlPoint.point);
            if (distance <= tolerance) {
                nearby.push(controlPoint);
            }
        }

        return nearby.sort(
            (a, b) =>
                this.getDistance(point, a.point) -
                this.getDistance(point, b.point),
        );
    }

    private isControllableSegment(
        segment: IControllableSegment,
    ): segment is IControllableSegment {
        return "getControlPoints" in segment && "updateControlPoint" in segment;
    }

    private replaceSegment(
        index: number,
        newSegment: IControllableSegment,
    ): void {
        // Mutate the existing path object instead of creating a new one.
        this._path.replaceSegment(index, newSegment);
    }

    private getDistance(p1: Point, p2: Point): number {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private generateControlPointId(
        segmentIndex: number,
        type: ControlPointType,
        pointIndex?: number,
    ): string {
        const suffix = pointIndex !== undefined ? `-${pointIndex}` : "";
        return `cp-${segmentIndex}-${type}${suffix}`;
    }
}
