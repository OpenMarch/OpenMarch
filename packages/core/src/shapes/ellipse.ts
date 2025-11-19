import {
    bboxFromCoordinates,
    computeOptimalCoordinateMapping,
} from "./utils.js";

export type MarcherCoordinateShapeArgs = {
    previousPositionsByMarcherId: Map<number, { x: number; y: number }>;
    currentPositionsByMarcherId: Map<number, { x: number; y: number }>;
};

type CoordinateObject = { id: number; x: number; y: number };

type CircleArgs = {
    centerX: number;
    centerY: number;
    radius: number;
};

export const createCircle = (
    coordinates: CoordinateObject[],
    circleArgs?: CircleArgs,
): CoordinateObject[] => {
    const count = coordinates.length;

    if (count === 0) {
        return [];
    }

    // Calculate center from the bounding box of current coordinates
    const coordArray: [number, number][] = coordinates.map((c) => [c.x, c.y]);
    const bbox = bboxFromCoordinates(coordArray);
    const centerX = bbox.left + bbox.width / 2;
    const centerY = bbox.top + bbox.height / 2;

    // Calculate radius based on the maximum dimension of the bounding box
    // This ensures stability when reapplying the circle to already-circled marchers
    const radius = Math.max(bbox.width, bbox.height) / 2;

    // Generate evenly spaced points around the circle
    const targetPositions: [number, number][] = [];
    for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI * i) / count;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        targetPositions.push([x, y]);
    }

    // Convert current positions to the format expected by the Hungarian algorithm
    const currentPositionsById: Record<number, [number, number]> = {};
    for (const coord of coordinates) {
        currentPositionsById[coord.id] = [coord.x, coord.y];
    }

    // Use Hungarian algorithm to compute optimal assignment
    const optimalMapping = computeOptimalCoordinateMapping({
        currentPositionsById,
        targetPositions,
    });

    // Build result with optimal positions
    return coordinates.map((coord) => ({
        id: coord.id,
        x: optimalMapping[coord.id]![0],
        y: optimalMapping[coord.id]![1],
    }));
};
