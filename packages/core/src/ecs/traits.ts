import type { IPath } from "@/path-utility";
import { trait } from "koota";

export const Transform = trait({ x: 0, y: 0, rotationDegrees: 0 });

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
export type SortedCoordinatesWithTimestamp = Array<
    CoordinateWithPath & { timestamp: number }
>;
export const KeyframeData = trait(() => [] as SortedCoordinatesWithTimestamp);
