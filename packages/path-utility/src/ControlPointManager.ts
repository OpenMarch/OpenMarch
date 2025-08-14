import {
    IControllableSegment,
    Point,
    ControlPoint,
    ControlPointType,
    ControlPointMoveCallback,
    ControlPointConfig,
} from "./interfaces";
import { Path } from "./Path";

/**
 * Manages control points for interactive path editing with efficient updates.
 * Only recalculates affected segments when control points are moved.
 */
export class ControlPointManager {
    private _path: Path;
    private _controlPoints: Map<string, ControlPoint> = new Map();
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

    /**
     * Gets all control points.
     */
    getAllControlPoints(): ControlPoint[] {
        return Array.from(this._controlPoints.values());
    }

    /**
     * Gets control points for a specific segment.
     */
    getControlPointsForSegment(segmentIndex: number): ControlPoint[] {
        return this.getAllControlPoints().filter(
            (cp) => cp.segmentIndex === segmentIndex,
        );
    }

    /**
     * Gets a control point by its ID.
     */
    getControlPoint(id: string): ControlPoint | undefined {
        return this._controlPoints.get(id);
    }

    /**
     * Moves a control point to a new position and updates the path efficiently.
     * Only recalculates the affected segment.
     */
    moveControlPoint(controlPointId: string, newPoint: Point): boolean {
        const controlPoint = this._controlPoints.get(controlPointId);
        console.log("controlPoint", controlPoint);
        if (!controlPoint) {
            return false;
        }

        const segment = this._path.segments[controlPoint.segmentIndex];
        if (!segment || !this.isControllableSegment(segment)) {
            return false;
        }

        try {
            // Update the segment with the new control point position
            const updatedSegment = segment.updateControlPoint(
                controlPoint.type,
                controlPoint.pointIndex,
                newPoint,
            );

            // Replace the segment in the path
            this.replaceSegment(controlPoint.segmentIndex, updatedSegment);

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

    /**
     * Moves multiple control points at once for batch operations.
     */
    moveControlPoints(updates: Array<{ id: string; point: Point }>): boolean {
        const segmentsToUpdate = new Map<number, IControllableSegment>();
        const affectedControlPoints = new Map<string, ControlPoint>();

        // Group updates by segment and validate all updates first
        for (const update of updates) {
            const controlPoint = this._controlPoints.get(update.id);
            if (!controlPoint) {
                console.warn(`Control point ${update.id} not found`);
                continue;
            }

            const segment = this._path.segments[controlPoint.segmentIndex];
            if (!segment || !this.isControllableSegment(segment)) {
                console.warn(
                    `Segment ${controlPoint.segmentIndex} is not controllable`,
                );
                continue;
            }

            affectedControlPoints.set(update.id, controlPoint);
            if (!segmentsToUpdate.has(controlPoint.segmentIndex)) {
                segmentsToUpdate.set(controlPoint.segmentIndex, segment);
            }
        }

        try {
            // Update each affected segment
            for (const [segmentIndex, originalSegment] of segmentsToUpdate) {
                let updatedSegment = originalSegment;

                // Apply all updates for this segment
                for (const update of updates) {
                    const controlPoint = affectedControlPoints.get(update.id);
                    if (
                        controlPoint &&
                        controlPoint.segmentIndex === segmentIndex
                    ) {
                        updatedSegment = updatedSegment.updateControlPoint(
                            controlPoint.type,
                            controlPoint.pointIndex,
                            update.point,
                        );
                    }
                }

                // Replace the segment
                this.replaceSegment(segmentIndex, updatedSegment);
            }

            // Update control points in our map
            for (const update of updates) {
                const controlPoint = affectedControlPoints.get(update.id);
                if (controlPoint) {
                    controlPoint.point = { ...update.point };
                }
            }

            // Notify callbacks for each update
            for (const update of updates) {
                this._callbacks.forEach((callback) => {
                    try {
                        callback(update.id, update.point);
                    } catch (error) {
                        console.error(
                            "Error in control point callback:",
                            error,
                        );
                    }
                });
            }

            return true;
        } catch (error) {
            console.error("Error in batch control point update:", error);
            return false;
        }
    }

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

        this._path.segments.forEach((segment, segmentIndex) => {
            if (this.isControllableSegment(segment)) {
                const controlPoints = segment.getControlPoints(segmentIndex);
                controlPoints.forEach((cp) => {
                    this._controlPoints.set(cp.id, cp);
                });
            }
        });
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
    ): ControlPoint | null {
        let nearest: ControlPoint | null = null;
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
    getControlPointsNear(point: Point, tolerance: number = 10): ControlPoint[] {
        const nearby: ControlPoint[] = [];

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
        // Create a new segments array with the updated segment
        const segments = [...this._path.segments];
        segments[index] = newSegment;

        // Create a new path with the updated segments
        this._path = new Path(segments);
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
