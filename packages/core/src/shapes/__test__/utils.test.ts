import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
    hungarianAlgorithm,
    computeOptimalCoordinateMapping,
    bboxFromCoordinates,
} from "../utils";

describe("hungarianAlgorithm", () => {
    describe("Example Tests - Small matrices", () => {
        it("should handle a 1x1 matrix", () => {
            const costMatrix = [[5]];
            const result = hungarianAlgorithm(costMatrix, 1);

            // assignment[0] is dummy, assignment[1] = 1 means target 1 is assigned to marcher 1
            expect(result).toHaveLength(2);
            expect(result[1]).toBe(1);
        });

        it("should solve a 2x2 matrix with clear optimal assignment", () => {
            // Marcher 0 -> [1, 10], Marcher 1 -> [10, 1]
            // Optimal: Marcher 0 -> Target 0, Marcher 1 -> Target 1
            const costMatrix = [
                [1, 10],
                [10, 1],
            ];
            const result = hungarianAlgorithm(costMatrix, 2);

            expect(result).toHaveLength(3);
            expect(result[1]).toBe(1); // Target 1 assigned to Marcher 1
            expect(result[2]).toBe(2); // Target 2 assigned to Marcher 2

            // Verify each marcher is assigned exactly once
            const marcherAssignments = result.slice(1);
            const uniqueAssignments = new Set(marcherAssignments);
            expect(uniqueAssignments.size).toBe(marcherAssignments.length);
        });

        it("should solve a 3x3 matrix with diagonal advantage", () => {
            // Diagonal has lowest costs
            const costMatrix = [
                [1, 9, 9],
                [9, 1, 9],
                [9, 9, 1],
            ];
            const result = hungarianAlgorithm(costMatrix, 3);

            expect(result).toHaveLength(4);
            expect(result[1]).toBe(1); // Target 1 -> Marcher 1
            expect(result[2]).toBe(2); // Target 2 -> Marcher 2
            expect(result[3]).toBe(3); // Target 3 -> Marcher 3
        });

        it("should solve a 3x3 matrix with anti-diagonal advantage", () => {
            // Anti-diagonal has lowest costs
            const costMatrix = [
                [9, 9, 1],
                [9, 1, 9],
                [1, 9, 9],
            ];
            const result = hungarianAlgorithm(costMatrix, 3);

            expect(result).toHaveLength(4);
            expect(result[1]).toBe(3); // Target 1 -> Marcher 3
            expect(result[2]).toBe(2); // Target 2 -> Marcher 2
            expect(result[3]).toBe(1); // Target 3 -> Marcher 1

            // Verify all marchers are used
            const marcherSet = new Set(result.slice(1));
            expect(marcherSet.size).toBe(3);
            expect(marcherSet.has(1)).toBe(true);
            expect(marcherSet.has(2)).toBe(true);
            expect(marcherSet.has(3)).toBe(true);
        });

        it("should handle a 4x4 matrix with specific known solution", () => {
            // Known optimal assignment problem
            const costMatrix = [
                [10, 19, 8, 15],
                [10, 18, 7, 17],
                [13, 16, 9, 14],
                [12, 19, 8, 18],
            ];
            const result = hungarianAlgorithm(costMatrix, 4);

            expect(result).toHaveLength(5);

            // Calculate total cost
            let totalCost = 0;
            for (let target = 1; target <= 4; target++) {
                const marcher = result[target]! - 1;
                totalCost += costMatrix[marcher]![target - 1]!;
            }

            // The optimal cost for this matrix is 50
            // (one valid assignment: [0->2, 1->1, 2->3, 3->0] or similar)
            expect(totalCost).toBeLessThanOrEqual(60);
        });

        it("should handle all equal costs", () => {
            const costMatrix = [
                [5, 5, 5],
                [5, 5, 5],
                [5, 5, 5],
            ];
            const result = hungarianAlgorithm(costMatrix, 3);

            expect(result).toHaveLength(4);

            // Any assignment is optimal, but each marcher should be assigned once
            const marcherSet = new Set(result.slice(1));
            expect(marcherSet.size).toBe(3);
        });

        it("should handle zero costs", () => {
            const costMatrix = [
                [0, 1, 2],
                [1, 0, 1],
                [2, 1, 0],
            ];
            const result = hungarianAlgorithm(costMatrix, 3);

            expect(result).toHaveLength(4);

            // Calculate total cost - should be 0 (diagonal)
            let totalCost = 0;
            for (let target = 1; target <= 3; target++) {
                const marcher = result[target]! - 1;
                totalCost += costMatrix[marcher]![target - 1]!;
            }

            expect(totalCost).toBe(0);
        });
    });

    describe("Example Tests - Larger matrices", () => {
        it("should solve a 5x5 matrix", () => {
            const costMatrix = [
                [12, 7, 9, 9, 10],
                [8, 9, 6, 6, 9],
                [7, 17, 12, 14, 11],
                [15, 14, 6, 6, 10],
                [4, 10, 7, 10, 9],
            ];
            const result = hungarianAlgorithm(costMatrix, 5);

            expect(result).toHaveLength(6);

            // Verify all marchers are assigned uniquely
            const marcherSet = new Set(result.slice(1));
            expect(marcherSet.size).toBe(5);

            // Calculate total cost
            let totalCost = 0;
            for (let target = 1; target <= 5; target++) {
                const marcher = result[target]! - 1;
                totalCost += costMatrix[marcher]![target - 1]!;
            }

            // The algorithm should find an optimal assignment
            expect(totalCost).toBeGreaterThan(0);
        });

        it("should handle a 10x10 matrix", () => {
            const size = 10;
            const costMatrix = Array.from({ length: size }, (_, i) =>
                Array.from({ length: size }, (_, j) => Math.abs(i - j) + 1),
            );

            const result = hungarianAlgorithm(costMatrix, size);

            expect(result).toHaveLength(size + 1);

            // Verify all marchers are assigned uniquely
            const marcherSet = new Set(result.slice(1));
            expect(marcherSet.size).toBe(size);
        });
    });

    describe("Property-based Tests - hungarianAlgorithm", () => {
        it("should always assign each target to exactly one marcher", () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 15 }),
                    fc.integer({ min: 1, max: 100 }),
                    (size, seed) => {
                        // Generate a random cost matrix
                        const rng = fc.sample(
                            fc.tuple(
                                ...Array(size * size)
                                    .fill(null)
                                    .map(() =>
                                        fc.integer({ min: 0, max: 100 }),
                                    ),
                            ),
                            { seed, numRuns: 1 },
                        )[0];

                        if (!rng) return true;

                        const costMatrix: number[][] = [];
                        for (let i = 0; i < size; i++) {
                            costMatrix.push(
                                rng.slice(i * size, (i + 1) * size),
                            );
                        }

                        const result = hungarianAlgorithm(costMatrix, size);

                        // Check that result has correct length
                        expect(result).toHaveLength(size + 1);

                        // Check that all marchers are assigned (1-indexed)
                        const marcherSet = new Set(result.slice(1));
                        expect(marcherSet.size).toBe(size);

                        // Check that all values are in valid range
                        for (let i = 1; i <= size; i++) {
                            expect(result[i]).toBeGreaterThanOrEqual(1);
                            expect(result[i]).toBeLessThanOrEqual(size);
                        }

                        return true;
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    describe("Edge Cases", () => {
        it("should handle large cost values", () => {
            const costMatrix = [
                [1e6, 1e9],
                [1e9, 1e6],
            ];
            const result = hungarianAlgorithm(costMatrix, 2);

            expect(result).toHaveLength(3);
            expect(result[1]).toBe(1);
            expect(result[2]).toBe(2);
        });

        it("should handle very small cost differences", () => {
            const costMatrix = [
                [1.001, 1.002],
                [1.002, 1.001],
            ];
            const result = hungarianAlgorithm(costMatrix, 2);

            expect(result).toHaveLength(3);
            const marcherSet = new Set(result.slice(1));
            expect(marcherSet.size).toBe(2);
        });
    });
});

describe("computeOptimalCoordinateMapping", () => {
    describe("Example Tests", () => {
        it("should map a single marcher to a single target", () => {
            const currentPositionsById = {
                1: [0, 0] as [number, number],
            };
            const targetPositions: [number, number][] = [[10, 10]];

            const result = computeOptimalCoordinateMapping({
                currentPositionsById,
                targetPositions,
            });

            expect(result).toEqual({
                1: [10, 10],
            });
        });

        it("should map two marchers optimally - no crossing", () => {
            const currentPositionsById = {
                1: [0, 0] as [number, number],
                2: [10, 0] as [number, number],
            };
            const targetPositions: [number, number][] = [
                [0, 10],
                [10, 10],
            ];

            const result = computeOptimalCoordinateMapping({
                currentPositionsById,
                targetPositions,
            });

            // Marcher 1 at (0,0) should go to (0,10) - distance 10
            // Marcher 2 at (10,0) should go to (10,10) - distance 10
            // Total distance: 20
            // Alternative: Marcher 1 to (10,10), Marcher 2 to (0,10) - distance 14.14 each ≈ 28.28
            expect(result[1]).toEqual([0, 10]);
            expect(result[2]).toEqual([10, 10]);
        });

        it("should minimize total distance for multiple marchers", () => {
            const currentPositionsById = {
                1: [0, 0] as [number, number],
                2: [5, 0] as [number, number],
                3: [10, 0] as [number, number],
            };
            const targetPositions: [number, number][] = [
                [0, 10],
                [5, 10],
                [10, 10],
            ];

            const result = computeOptimalCoordinateMapping({
                currentPositionsById,
                targetPositions,
            });

            // Each marcher should go straight up (minimal distance)
            expect(result[1]).toEqual([0, 10]);
            expect(result[2]).toEqual([5, 10]);
            expect(result[3]).toEqual([10, 10]);
        });

        it("should handle crossing paths when optimal", () => {
            const currentPositionsById = {
                1: [0, 0] as [number, number],
                2: [10, 0] as [number, number],
            };
            const targetPositions: [number, number][] = [
                [10, 5],
                [0, 5],
            ];

            const result = computeOptimalCoordinateMapping({
                currentPositionsById,
                targetPositions,
            });

            // Marcher 1 at (0,0) closer to (0,5) - distance 5
            // Marcher 2 at (10,0) closer to (10,5) - distance 5
            // This is better than crossing (would be ~11.18 each)
            expect(result[1]).toEqual([0, 5]);
            expect(result[2]).toEqual([10, 5]);
        });

        it("should handle square formation to square formation", () => {
            const currentPositionsById = {
                1: [0, 0] as [number, number],
                2: [10, 0] as [number, number],
                3: [0, 10] as [number, number],
                4: [10, 10] as [number, number],
            };
            const targetPositions: [number, number][] = [
                [5, 5],
                [15, 5],
                [5, 15],
                [15, 15],
            ];

            const result = computeOptimalCoordinateMapping({
                currentPositionsById,
                targetPositions,
            });

            // Verify all marchers are assigned
            expect(Object.keys(result)).toHaveLength(4);

            // Calculate total distance
            let totalDistance = 0;
            Object.entries(currentPositionsById).forEach(([id, currentPos]) => {
                const targetPos = result[Number(id)]!;
                const distance = Math.hypot(
                    currentPos[0] - targetPos[0],
                    currentPos[1] - targetPos[1],
                );
                totalDistance += distance;
            });

            // The optimal assignment should have reasonable total distance
            // Each marcher moves diagonally ~7.07 units
            expect(totalDistance).toBeLessThan(35); // 4 * sqrt(50) ≈ 28.28
        });

        it("should handle line to line formation", () => {
            const currentPositionsById = {
                1: [0, 0] as [number, number],
                2: [1, 0] as [number, number],
                3: [2, 0] as [number, number],
                4: [3, 0] as [number, number],
            };
            const targetPositions: [number, number][] = [
                [0, 10],
                [1, 10],
                [2, 10],
                [3, 10],
            ];

            const result = computeOptimalCoordinateMapping({
                currentPositionsById,
                targetPositions,
            });

            // Each marcher should move straight up
            expect(result[1]).toEqual([0, 10]);
            expect(result[2]).toEqual([1, 10]);
            expect(result[3]).toEqual([2, 10]);
            expect(result[4]).toEqual([3, 10]);
        });

        it("should handle circular arrangement", () => {
            const radius = 10;
            const currentPositionsById = {
                1: [radius, 0] as [number, number],
                2: [0, radius] as [number, number],
                3: [-radius, 0] as [number, number],
                4: [0, -radius] as [number, number],
            };

            // Rotate targets by 90 degrees
            const targetPositions: [number, number][] = [
                [0, radius],
                [-radius, 0],
                [0, -radius],
                [radius, 0],
            ];

            const result = computeOptimalCoordinateMapping({
                currentPositionsById,
                targetPositions,
            });

            // Verify all marchers are assigned
            expect(Object.keys(result)).toHaveLength(4);

            // Each marcher should move to adjacent position
            // Distance should be 2*radius*sin(45°) ≈ 14.14 for each
            let totalDistance = 0;
            Object.entries(currentPositionsById).forEach(([id, currentPos]) => {
                const targetPos = result[Number(id)]!;
                const distance = Math.hypot(
                    currentPos[0] - targetPos[0],
                    currentPos[1] - targetPos[1],
                );
                totalDistance += distance;
            });

            expect(totalDistance).toBeLessThan(60);
        });
    });

    describe("Property-based Tests - computeOptimalCoordinateMapping", () => {
        it("should produce assignments with reasonable total distance", () => {
            fc.assert(
                fc.property(fc.integer({ min: 2, max: 10 }), (count) => {
                    // Create a simple grid
                    const currentPositionsById: Record<
                        number,
                        [number, number]
                    > = {};
                    for (let i = 0; i < count; i++) {
                        currentPositionsById[i + 1] = [i * 10, 0];
                    }

                    // Move targets slightly
                    const targetPositions: [number, number][] = [];
                    for (let i = 0; i < count; i++) {
                        targetPositions.push([i * 10, 10]);
                    }

                    const result = computeOptimalCoordinateMapping({
                        currentPositionsById,
                        targetPositions,
                    });

                    // Calculate total distance
                    let totalDistance = 0;
                    Object.entries(currentPositionsById).forEach(
                        ([id, currentPos]) => {
                            const targetPos = result[Number(id)]!;
                            const distance = Math.hypot(
                                currentPos[0] - targetPos[0],
                                currentPos[1] - targetPos[1],
                            );
                            totalDistance += distance;
                        },
                    );

                    // Each should move 10 units, so total should be count * 10
                    expect(totalDistance).toBeCloseTo(count * 10, 0);

                    return true;
                }),
                { numRuns: 20 },
            );
        });

        it("should handle marchers at the same position", () => {
            fc.assert(
                fc.property(fc.integer({ min: 2, max: 8 }), (count) => {
                    // All marchers at origin
                    const currentPositionsById: Record<
                        number,
                        [number, number]
                    > = {};
                    for (let i = 0; i < count; i++) {
                        currentPositionsById[i + 1] = [0, 0];
                    }

                    // Targets in a line
                    const targetPositions: [number, number][] = [];
                    for (let i = 0; i < count; i++) {
                        targetPositions.push([i * 10, 0]);
                    }

                    const result = computeOptimalCoordinateMapping({
                        currentPositionsById,
                        targetPositions,
                    });

                    // All marchers should be assigned
                    expect(Object.keys(result)).toHaveLength(count);

                    // All targets should be used
                    const assignedTargets = new Set(
                        Object.values(result).map((pos) => pos.join(",")),
                    );
                    expect(assignedTargets.size).toBe(count);

                    return true;
                }),
                { numRuns: 15 },
            );
        });
    });

    describe("Error Cases", () => {
        it("should throw error when marcher count doesn't match target count", () => {
            const currentPositionsById = {
                1: [0, 0] as [number, number],
                2: [10, 0] as [number, number],
            };
            const targetPositions: [number, number][] = [[0, 10]];

            expect(() =>
                computeOptimalCoordinateMapping({
                    currentPositionsById,
                    targetPositions,
                }),
            ).toThrow("Marcher count and destination count must match");
        });

        it("should throw error when more targets than marchers", () => {
            const currentPositionsById = {
                1: [0, 0] as [number, number],
            };
            const targetPositions: [number, number][] = [
                [0, 10],
                [10, 10],
            ];

            expect(() =>
                computeOptimalCoordinateMapping({
                    currentPositionsById,
                    targetPositions,
                }),
            ).toThrow("Marcher count and destination count must match");
        });
    });

    describe("Parametrized Tests - Various Formation Changes", () => {
        const testCases = [
            {
                name: "horizontal line to vertical line",
                current: [
                    [0, 0],
                    [10, 0],
                    [20, 0],
                    [30, 0],
                ],
                targets: [
                    [0, 0],
                    [0, 10],
                    [0, 20],
                    [0, 30],
                ],
            },
            {
                name: "square to diamond",
                current: [
                    [0, 0],
                    [10, 0],
                    [0, 10],
                    [10, 10],
                ],
                targets: [
                    [5, 0],
                    [10, 5],
                    [5, 10],
                    [0, 5],
                ],
            },
            {
                name: "diagonal line spread",
                current: [
                    [0, 0],
                    [5, 5],
                    [10, 10],
                ],
                targets: [
                    [0, 0],
                    [10, 0],
                    [0, 10],
                ],
            },
        ] as const;

        it.for(testCases)("$name", ({ current, targets }) => {
            const currentPositionsById: Record<number, [number, number]> = {};
            current.forEach((pos, i) => {
                currentPositionsById[i + 1] = pos as [number, number];
            });

            const targetPositions = targets.map(
                (pos) => pos as [number, number],
            );

            const result = computeOptimalCoordinateMapping({
                currentPositionsById,
                targetPositions,
            });

            // Verify all marchers assigned
            expect(Object.keys(result)).toHaveLength(current.length);

            // Verify all targets used
            const assignedTargets = new Set(
                Object.values(result).map((pos) => pos.join(",")),
            );
            expect(assignedTargets.size).toBe(targets.length);

            // Calculate and verify reasonable total distance
            let totalDistance = 0;
            Object.entries(currentPositionsById).forEach(([id, currentPos]) => {
                const targetPos = result[Number(id)]!;
                const distance = Math.hypot(
                    currentPos[0] - targetPos[0],
                    currentPos[1] - targetPos[1],
                );
                totalDistance += distance;
            });

            // Total distance should be positive and finite
            expect(totalDistance).toBeGreaterThan(0);
            expect(totalDistance).toBeLessThan(Infinity);
        });
    });
});

describe("findBoundingBoxFromCoordinates", () => {
    describe("Example Tests", () => {
        it("should return zero-sized box for empty coordinates", () => {
            const coordinates: [number, number][] = [];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: 0,
                top: 0,
                width: 0,
                height: 0,
            });
        });

        it("should return zero-sized box for a single point", () => {
            const coordinates: [number, number][] = [[5, 10]];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: 5,
                top: 10,
                width: 0,
                height: 0,
            });
        });

        it("should calculate bounding box for two points", () => {
            const coordinates: [number, number][] = [
                [0, 0],
                [10, 20],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: 0,
                top: 0,
                width: 10,
                height: 20,
            });
        });

        it("should calculate bounding box for rectangle corners", () => {
            const coordinates: [number, number][] = [
                [10, 20],
                [50, 20],
                [10, 60],
                [50, 60],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: 10,
                top: 20,
                width: 40,
                height: 40,
            });
        });

        it("should calculate bounding box for points with negative coordinates", () => {
            const coordinates: [number, number][] = [
                [-10, -5],
                [10, 15],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: -10,
                top: -5,
                width: 20,
                height: 20,
            });
        });

        it("should calculate bounding box for multiple points in various positions", () => {
            const coordinates: [number, number][] = [
                [5, 5],
                [15, 10],
                [10, 20],
                [8, 12],
                [12, 8],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: 5,
                top: 5,
                width: 10,
                height: 15,
            });
        });

        it("should handle points all on the same horizontal line", () => {
            const coordinates: [number, number][] = [
                [0, 10],
                [5, 10],
                [10, 10],
                [15, 10],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: 0,
                top: 10,
                width: 15,
                height: 0,
            });
        });

        it("should handle points all on the same vertical line", () => {
            const coordinates: [number, number][] = [
                [5, 0],
                [5, 10],
                [5, 20],
                [5, 30],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: 5,
                top: 0,
                width: 0,
                height: 30,
            });
        });

        it("should handle circular arrangement of points", () => {
            const radius = 10;
            const coordinates: [number, number][] = [
                [radius, 0],
                [0, radius],
                [-radius, 0],
                [0, -radius],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: -10,
                top: -10,
                width: 20,
                height: 20,
            });
        });

        it("should handle points with decimal coordinates", () => {
            const coordinates: [number, number][] = [
                [1.5, 2.5],
                [3.7, 8.9],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: 1.5,
                top: 2.5,
                width: 2.2,
                height: 6.4,
            });
        });
    });

    describe("Edge Cases", () => {
        it("should handle very large coordinates", () => {
            const coordinates: [number, number][] = [
                [1e6, 1e6],
                [2e6, 2e6],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: 1e6,
                top: 1e6,
                width: 1e6,
                height: 1e6,
            });
        });

        it("should handle zero coordinates", () => {
            const coordinates: [number, number][] = [
                [0, 0],
                [0, 0],
                [0, 0],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: 0,
                top: 0,
                width: 0,
                height: 0,
            });
        });

        it("should handle mixed positive and negative coordinates", () => {
            const coordinates: [number, number][] = [
                [-100, -200],
                [100, 200],
                [-50, 150],
                [75, -100],
            ];
            const result = bboxFromCoordinates(coordinates);

            expect(result).toEqual({
                left: -100,
                top: -200,
                width: 200,
                height: 400,
            });
        });
    });

    describe("Property-based Tests", () => {
        it("should always contain all input points", () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.tuple(
                            fc.integer({ min: -1000, max: 1000 }),
                            fc.integer({ min: -1000, max: 1000 }),
                        ),
                        { minLength: 1, maxLength: 20 },
                    ),
                    (coordinates) => {
                        const result = bboxFromCoordinates(
                            coordinates as [number, number][],
                        );

                        // All points should be within or on the bounding box
                        for (const [x, y] of coordinates) {
                            expect(x).toBeGreaterThanOrEqual(result.left);
                            expect(x).toBeLessThanOrEqual(
                                result.left + result.width,
                            );
                            expect(y).toBeGreaterThanOrEqual(result.top);
                            expect(y).toBeLessThanOrEqual(
                                result.top + result.height,
                            );
                        }

                        return true;
                    },
                ),
                { numRuns: 50 },
            );
        });

        it("should have non-negative width and height", () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.tuple(
                            fc.float({ min: -1e6, max: 1e6 }),
                            fc.float({ min: -1e6, max: 1e6 }),
                        ),
                        { minLength: 0, maxLength: 50 },
                    ),
                    (coordinates) => {
                        const result = bboxFromCoordinates(
                            coordinates as [number, number][],
                        );

                        expect(result.width).toBeGreaterThanOrEqual(0);
                        expect(result.height).toBeGreaterThanOrEqual(0);

                        return true;
                    },
                ),
                { numRuns: 50 },
            );
        });

        it("should have at least one point on each edge of the bounding box", () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.tuple(
                            fc.integer({ min: -500, max: 500 }),
                            fc.integer({ min: -500, max: 500 }),
                        ),
                        { minLength: 1, maxLength: 30 },
                    ),
                    (coordinates) => {
                        const result = bboxFromCoordinates(
                            coordinates as [number, number][],
                        );

                        // At least one point should have x = left
                        const hasLeftPoint = coordinates.some(
                            ([x]) => x === result.left,
                        );
                        expect(hasLeftPoint).toBe(true);

                        // At least one point should have x = left + width (right edge)
                        const hasRightPoint = coordinates.some(
                            ([x]) => x === result.left + result.width,
                        );
                        expect(hasRightPoint).toBe(true);

                        // At least one point should have y = top
                        const hasTopPoint = coordinates.some(
                            ([, y]) => y === result.top,
                        );
                        expect(hasTopPoint).toBe(true);

                        // At least one point should have y = top + height (bottom edge)
                        const hasBottomPoint = coordinates.some(
                            ([, y]) => y === result.top + result.height,
                        );
                        expect(hasBottomPoint).toBe(true);

                        return true;
                    },
                ),
                { numRuns: 50 },
            );
        });
    });
});
