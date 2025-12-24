import { Path, Line, Arc, CubicCurve, Spline } from "@openmarch/core";

/**
 * Mock pathway data for testing purposes.
 * Uses the Path utility to create realistic pathway data with various segment types.
 */

export interface MockPathway {
    path_data: string;
    notes: string | null;
}

/**
 * Creates a simple straight line pathway
 */
export function createStraightLinePathway(): MockPathway {
    const path = new Path([new Line({ x: 0, y: 0 }, { x: 100, y: 100 })]);

    return {
        path_data: path.toJson(),
        notes: "Straight line pathway",
    };
}

/**
 * Creates a pathway with multiple line segments
 */
export function createMultiLinePathway(): MockPathway {
    const path = new Path([
        new Line({ x: 0, y: 0 }, { x: 50, y: 50 }),
        new Line({ x: 50, y: 50 }, { x: 100, y: 25 }),
        new Line({ x: 100, y: 25 }, { x: 150, y: 75 }),
    ]);

    return {
        path_data: path.toJson(),
        notes: "Multi-line pathway",
    };
}

/**
 * Creates a pathway with curves
 */
export function createCurvedPathway(): MockPathway {
    const path = new Path([
        new Line({ x: 0, y: 0 }, { x: 50, y: 0 }),
        new CubicCurve(
            { x: 50, y: 0 },
            { x: 75, y: 0 },
            { x: 75, y: 50 },
            { x: 50, y: 50 },
        ),
        new Line({ x: 50, y: 50 }, { x: 0, y: 50 }),
        new CubicCurve(
            { x: 0, y: 50 },
            { x: -25, y: 50 },
            { x: -25, y: 0 },
            { x: 0, y: 0 },
        ),
    ]);

    return {
        path_data: path.toJson(),
        notes: "Curved pathway with cubic curves",
    };
}

/**
 * Creates a pathway with arcs
 */
export function createArcPathway(): MockPathway {
    const path = new Path([
        new Line({ x: 0, y: 0 }, { x: 50, y: 0 }),
        new Arc(
            { x: 50, y: 0 },
            25, // rx
            25, // ry
            0, // xAxisRotation
            0, // largeArcFlag
            1, // sweepFlag
            { x: 50, y: 50 },
        ),
        new Line({ x: 50, y: 50 }, { x: 0, y: 50 }),
        new Arc(
            { x: 0, y: 50 },
            25, // rx
            25, // ry
            0, // xAxisRotation
            0, // largeArcFlag
            1, // sweepFlag
            { x: 0, y: 0 },
        ),
    ]);

    return {
        path_data: path.toJson(),
        notes: "Pathway with arc segments",
    };
}

/**
 * Creates a pathway with splines
 */
export function createSplinePathway(): MockPathway {
    const path = new Path([
        new Spline([
            { x: 0, y: 0 },
            { x: 25, y: 25 },
            { x: 50, y: 0 },
            { x: 75, y: 25 },
            { x: 100, y: 0 },
        ]),
    ]);

    return {
        path_data: path.toJson(),
        notes: "Spline pathway",
    };
}

/**
 * Creates a complex pathway with mixed segment types
 */
export function createComplexPathway(): MockPathway {
    const path = new Path([
        new Line({ x: 0, y: 0 }, { x: 30, y: 0 }),
        new Arc(
            { x: 30, y: 0 },
            15, // rx
            15, // ry
            0, // xAxisRotation
            0, // largeArcFlag
            1, // sweepFlag
            { x: 30, y: 30 },
        ),
        new CubicCurve(
            { x: 30, y: 30 },
            { x: 45, y: 30 },
            { x: 45, y: 60 },
            { x: 30, y: 60 },
        ),
        new Spline([
            { x: 30, y: 60 },
            { x: 45, y: 75 },
            { x: 60, y: 60 },
            { x: 75, y: 75 },
            { x: 90, y: 60 },
        ]),
        new Line({ x: 90, y: 60 }, { x: 120, y: 60 }),
    ]);

    return {
        path_data: path.toJson(),
        notes: "Complex pathway with mixed segments",
    };
}

/**
 * Creates a pathway from points (simplified line segments)
 */
export function createPathwayFromPoints(): MockPathway {
    const points = [
        { x: 0, y: 0 },
        { x: 20, y: 10 },
        { x: 40, y: 5 },
        { x: 60, y: 15 },
        { x: 80, y: 10 },
        { x: 100, y: 20 },
    ];

    const path = Path.fromPoints(points);

    return {
        path_data: path.toJson(),
        notes: "Pathway created from points",
    };
}

/**
 * Creates a pathway from SVG string
 */
export function createPathwayFromSvg(): MockPathway {
    const svgPath = "M 0 0 L 50 50 Q 75 0 100 50 L 150 0";
    const path = Path.fromSvgString(svgPath);

    return {
        path_data: path.toJson(),
        notes: "Pathway created from SVG string",
    };
}

/**
 * Array of all mock pathways for easy testing
 */
export const MockPathways: MockPathway[] = [
    createStraightLinePathway(),
    createMultiLinePathway(),
    createCurvedPathway(),
    createArcPathway(),
    createSplinePathway(),
    createComplexPathway(),
    createPathwayFromPoints(),
    createPathwayFromSvg(),
];

/**
 * Creates a random pathway from the available types
 */
export function createRandomPathway(): MockPathway {
    const pathwayCreators = [
        createStraightLinePathway,
        createMultiLinePathway,
        createCurvedPathway,
        createArcPathway,
        createSplinePathway,
        createComplexPathway,
        createPathwayFromPoints,
        createPathwayFromSvg,
    ];

    const randomIndex = Math.floor(Math.random() * pathwayCreators.length);
    return pathwayCreators[randomIndex]();
}

/**
 * Creates multiple pathways with different types
 */
export function createMultiplePathways(count: number): MockPathway[] {
    const pathways: MockPathway[] = [];

    for (let i = 0; i < count; i++) {
        pathways.push(createRandomPathway());
    }

    return pathways;
}
