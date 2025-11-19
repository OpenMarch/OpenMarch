/**
 * Solves the assignment problem using the Hungarian algorithm.
 * @returns assignment array where assignment[j] = i means target j is assigned to marcher i
 */
export const hungarianAlgorithm = (
    costMatrix: number[][],
    count: number,
): number[] => {
    const u = Array(count + 1).fill(0); // potentials for marchers
    const v = Array(count + 1).fill(0); // potentials for targets
    const assignment = Array(count + 1).fill(0); // assignment[j] = i
    const path = Array(count + 1).fill(0);

    for (let i = 1; i <= count; i++) {
        assignment[0] = i;
        let currentTarget = 0;

        const minCost = Array(count + 1).fill(Infinity);
        const visited = Array(count + 1).fill(false);

        do {
            visited[currentTarget] = true;
            const currentMarcher = assignment[currentTarget];

            let delta = Infinity;
            let nextTarget = 0;

            for (let j = 1; j <= count; j++) {
                if (!visited[j]) {
                    const costRow = costMatrix[currentMarcher - 1];
                    if (!costRow) {
                        throw new Error(
                            `Missing cost row at index ${currentMarcher - 1}`,
                        );
                    }
                    const cost = costRow[j - 1];
                    if (cost === undefined) {
                        throw new Error(
                            `Missing cost at [${currentMarcher - 1}][${j - 1}]`,
                        );
                    }
                    const adjustedCost = cost - u[currentMarcher]! - v[j]!;

                    if (adjustedCost < minCost[j]!) {
                        minCost[j] = adjustedCost;
                        path[j] = currentTarget;
                    }
                    if (minCost[j]! < delta) {
                        delta = minCost[j]!;
                        nextTarget = j;
                    }
                }
            }

            for (let j = 0; j <= count; j++) {
                if (visited[j]) {
                    u[assignment[j]] += delta;
                    v[j] -= delta;
                } else {
                    minCost[j] -= delta;
                }
            }

            currentTarget = nextTarget;
        } while (assignment[currentTarget] !== 0);

        // reconstruct path
        do {
            const prevTarget = path[currentTarget];
            assignment[currentTarget] = assignment[prevTarget];
            currentTarget = prevTarget;
        } while (currentTarget !== 0);
    }

    return assignment;
};

export const computeOptimalCoordinateMapping = ({
    currentPositionsById,
    targetPositions,
}: {
    currentPositionsById: Record<number, [number, number]>;
    targetPositions: [number, number][];
}): Record<number, [number, number]> => {
    const marcherEntries = Object.entries(currentPositionsById);
    const marcherCount = marcherEntries.length;

    if (targetPositions.length !== marcherCount) {
        throw new Error("Marcher count and destination count must match.");
    }

    // ---- Create cost matrix: cost[i][j] = distance from marcher i to target j ----
    const distance = (a: [number, number], b: [number, number]) =>
        Math.hypot(a[0] - b[0], a[1] - b[1]);

    const costMatrix: number[][] = Array.from(
        { length: marcherCount },
        (_, i) => {
            const marcherEntry = marcherEntries[i];
            if (!marcherEntry) {
                throw new Error(`Missing marcher entry at index ${i}`);
            }
            return Array.from({ length: marcherCount }, (_, j) => {
                const targetPos = targetPositions[j];
                if (!targetPos) {
                    throw new Error(`Missing target position at index ${j}`);
                }
                return distance(marcherEntry[1], targetPos);
            });
        },
    );

    // ---- Run Hungarian algorithm ----
    const assignment = hungarianAlgorithm(costMatrix, marcherCount);

    // ---- Extract final pairings ----
    const result: Record<number, [number, number]> = {};

    for (let targetIndex = 1; targetIndex <= marcherCount; targetIndex++) {
        const marcherIndex = assignment[targetIndex]! - 1;
        const marcherEntry = marcherEntries[marcherIndex];
        if (!marcherEntry) {
            throw new Error(`Missing marcher entry at index ${marcherIndex}`);
        }
        const [marcherId] = marcherEntry;
        const targetPos = targetPositions[targetIndex - 1];
        if (!targetPos) {
            throw new Error(
                `Missing target position at index ${targetIndex - 1}`,
            );
        }
        result[Number(marcherId)] = targetPos;
    }

    return result;
};

export const bboxFromCoordinates = (
    coordinates: [number, number][],
): { left: number; top: number; width: number; height: number } => {
    if (coordinates.length === 0) {
        return { left: 0, top: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const [x, y] of coordinates) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    return {
        left: minX,
        top: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
};

export const coordinateObjectToArray = (coordinateObject: {
    x: number;
    y: number;
}): [number, number] => [coordinateObject.x, coordinateObject.y];

export const coordinateArrayToObject = (
    coordinateArray: [number, number],
): { x: number; y: number } => ({
    x: coordinateArray[0],
    y: coordinateArray[1],
});
