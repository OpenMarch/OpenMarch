import type { IPath } from "@/path-utility";
import { getCoordinatesAtTime } from "./coordinate-calculator";

/**
 * Manages the coordinates of all movable objects in OpenMarch.
 */
export default class CoordinateManager {
    private objectTimelinesByUid: Record<string, ObjectCoordinateTimeline> = {};

    /**
     * Calculate coordinates for a given timestamp.
     * Pure function - no state changes.
     */
    public getCoordinates(
        timestamp: number,
    ): Record<string, { x: number; y: number }> {
        const result: Record<string, { x: number; y: number }> = {};

        for (const [uid, timeline] of Object.entries(
            this.objectTimelinesByUid,
        )) {
            const coordinates = getCoordinatesAtTime(timestamp, timeline);
            if (coordinates) {
                result[uid] = coordinates;
            }
        }

        return result;
    }

    public updateTimelines(
        timelines: Record<string, ObjectCoordinateTimeline>,
    ): void {
        this.objectTimelinesByUid = timelines;
    }
}

export type CoordinateWithPath = {
    rotation_degrees: number;
    /** x coordinate of the arrival point. */
    x: number;
    /** y coordinate of the arrival point. */
    y: number;
    /** The path data to traverse to this coordinate. */
    path_data: IPath | null;
    /**
     * The position on the path to start traversing from.
     * If null, then it is assumed to be 0 (the start of the path).
     */
    path_start_position: number | null;
    /**
     * The position on the path to arrive at.
     * If null, then it is assumed to be 1 (the end of the path).
     */
    path_arrival_position: number | null;
};

export type CoordinateWithPathIdentifiable = CoordinateWithPath & {
    uid: string;
};

export type CoordinateTimeline = {
    sortedCoordinatesWithTimestamp: Array<
        CoordinateWithPath & { timestamp: number }
    >;
};

/**
 * Function provided by the subscriber to be called when the coordinates change.
 *
 * @param currentCoordinates The current coordinates of all movable objects in OpenMarch, keyed by uid.
 */
export type SubscriberFunction = (
    currentCoordinates: Record<string, CoordinateWithPath>,
) => void;
