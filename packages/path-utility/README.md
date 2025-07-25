# Path Utility

A TypeScript library for working with complex paths that can contain multiple types of segments including lines, arcs, cubic curves, and splines. The library provides full JSON serialization support that preserves the original segment data types.

## Key Features

- **Multiple Segment Types**: Support for lines, arcs, cubic Bézier curves, and splines
- **Preserves Original Data**: JSON serialization maintains the original segment type and parameters
- **Spline Support**: Full support for B-splines and Catmull-Rom splines with control points, knots, and weights
- **SVG Compatibility**: Can convert to/from SVG path strings
- **Type Safe**: Full TypeScript support with comprehensive interfaces

## Installation

```bash
npm install @openmarch/path-utility
```

## Critical Feature: Preserving Spline vs SVG Data

The key feature of this library is the ability to distinguish between spline segments and SVG segments in JSON serialization:

- **Spline segments** preserve their original control points, degree, knots, weights, and other spline-specific parameters
- **SVG segments** (lines, arcs, cubic curves) preserve their geometric parameters
- When converting splines to SVG, the spline data is approximated as line segments, but the original spline data is lost
- When serializing to JSON, the original spline data is preserved intact

## Usage Examples

### Basic Path Creation

```typescript
import { Path, Line, Arc, CubicCurve, Spline } from "@openmarch/path-utility";

// Create a new path
const path = new Path();

// Add different segment types
path.addSegment(new Line({ x: 0, y: 0 }, { x: 10, y: 10 }));

path.addSegment(
  new Arc(
    { x: 15, y: 15 }, // center
    5, // radius
    0, // start angle
    Math.PI / 2, // end angle
    true, // clockwise
  ),
);

path.addSegment(
  new CubicCurve(
    { x: 20, y: 15 }, // start point
    { x: 25, y: 20 }, // control point 1
    { x: 30, y: 20 }, // control point 2
    { x: 35, y: 15 }, // end point
  ),
);
```

### Working with Splines

```typescript
// Create a spline with control points
const splinePoints = [
  { x: 0, y: 0 },
  { x: 10, y: 20 },
  { x: 30, y: 25 },
  { x: 50, y: 10 },
  { x: 70, y: 0 },
];

// Simple Catmull-Rom spline
const spline = Spline.fromPoints(splinePoints, 0.5, false);

// Advanced B-spline with custom parameters
const bSpline = new Spline(
  splinePoints,
  3, // degree
  [0, 0, 0, 0, 1, 1, 1, 1], // knot vector
  [1, 2, 1, 1, 1], // weights (NURBS)
  false, // closed
  0.5, // tension
);

const splinePath = new Path([spline]);
```

### JSON Serialization - The Key Feature

```typescript
// Create a path with mixed segment types
const originalPath = new Path();
originalPath.addSegment(new Line({ x: 0, y: 0 }, { x: 10, y: 0 }));
originalPath.addSegment(
  new Spline(
    [
      { x: 10, y: 0 },
      { x: 15, y: 10 },
      { x: 25, y: 15 },
      { x: 35, y: 5 },
      { x: 40, y: 0 },
    ],
    3,
    undefined,
    undefined,
    false,
    0.7,
  ),
);

// Serialize to JSON - preserves original segment data
const json = originalPath.toJson();
console.log(json);
/* Output:
{
  "segments": [
    {
      "type": "line",
      "data": {
        "startPoint": { "x": 0, "y": 0 },
        "endPoint": { "x": 10, "y": 0 }
      }
    },
    {
      "type": "spline",
      "data": {
        "controlPoints": [
          { "x": 10, "y": 0 },
          { "x": 15, "y": 10 },
          { "x": 25, "y": 15 },
          { "x": 35, "y": 5 },
          { "x": 40, "y": 0 }
        ],
        "degree": 3,
        "knots": null,
        "weights": null,
        "closed": false,
        "tension": 0.7
      }
    }
  ]
}
*/

// Deserialize from JSON - reconstructs original segment types
const reconstructedPath = Path.fromJson(json);
console.log(reconstructedPath.segments[1].type); // "spline"

// The spline segment preserves all original data
const splineSegment = reconstructedPath.segments[1] as Spline;
console.log(splineSegment.controlPoints); // Original control points
console.log(splineSegment.tension); // 0.7
```

### Comparing Spline vs SVG Serialization

```typescript
// Original spline
const originalSpline = new Spline(
  [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 30, y: 25 },
    { x: 50, y: 10 },
  ],
  3,
  undefined,
  undefined,
  false,
  0.8,
);

const splinePath = new Path([originalSpline]);

// Method 1: Serialize spline path directly (preserves spline data)
const splineJson = splinePath.toJson();
const reconstructedSplinePath = Path.fromJson(splineJson);
console.log(reconstructedSplinePath.segments[0].type); // "spline"

// Method 2: Convert to SVG first, then create path (loses spline data)
const svgString = originalSpline.toSvgString();
const svgPath = Path.fromSvgString(svgString);
const svgJson = svgPath.toJson();
const reconstructedSvgPath = Path.fromJson(svgJson);
console.log(reconstructedSvgPath.segments[0].type); // "line"
console.log(reconstructedSvgPath.segments.length); // Multiple line segments

// The key difference:
// - splineJson preserves the original 4 control points and tension parameter
// - svgJson contains many line segments approximating the spline curve
```

### Path Operations

```typescript
const path = new Path();
// ... add segments ...

// Get total length
const length = path.getTotalLength();

// Get point at specific distance along path
const midpoint = path.getPointAtLength(length / 2);

// Convert to SVG path string
const svgPathString = path.toSvgString();

// Create path from SVG string
const pathFromSvg = Path.fromSvgString("M 0 0 L 10 10 C 15 15 20 20 25 25");
```

## API Reference

### Path Class

- `constructor(segments?: IPathSegment[])` - Create a new path
- `addSegment(segment: IPathSegment)` - Add a segment to the path
- `getTotalLength(): number` - Get the total length of the path
- `getPointAtLength(dist: number): Point` - Get a point at a specific distance
- `toSvgString(): string` - Convert to SVG path string
- `toJson(): string` - Serialize to JSON (preserves segment types)
- `fromJson(json: string): IPath` - Deserialize from JSON
- `static fromJson(json: string): Path` - Create path from JSON
- `static fromSvgString(svg: string): Path` - Create path from SVG

### Segment Types

#### Line

```typescript
new Line(startPoint: Point, endPoint: Point)
```

#### Arc

```typescript
new Arc(
    center: Point,
    radius: number,
    startAngle: number,
    endAngle: number,
    clockwise?: boolean
)
```

#### CubicCurve

```typescript
new CubicCurve(
    startPoint: Point,
    controlPoint1: Point,
    controlPoint2: Point,
    endPoint: Point
)
```

#### Spline

```typescript
new Spline(
    controlPoints: Point[],
    degree?: number,
    knots?: number[],
    weights?: number[],
    closed?: boolean,
    tension?: number
)

// Factory methods
Spline.fromPoints(points: Point[], tension?: number, closed?: boolean)
Spline.createBSpline(controlPoints: Point[], degree: number, knots: number[], weights?: number[])
```

## Testing

Run the tests to see examples of how the serialization preserves different segment types:

```bash
npm test
```

The tests demonstrate the key difference between spline and SVG serialization, showing how splines maintain their original control points and parameters while SVG conversions result in line segment approximations.

## License

MIT
