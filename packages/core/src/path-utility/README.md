# Path Utility

A TypeScript library for working with complex paths that can contain multiple types of segments including lines, arcs, cubic curves, and splines. The library provides full JSON serialization support that preserves the original segment data types and now includes **interactive control point editing** for UI integration.

## Key Features

- **Multiple Segment Types**: Support for lines, arcs, cubic Bézier curves, and splines
- **Interactive Control Points**: Move control points to modify path shapes with efficient updates
- **Preserves Original Data**: JSON serialization maintains the original segment type and parameters
- **Spline Support**: Full support for B-splines and Catmull-Rom splines with control points, knots, and weights
- **SVG Compatibility**: Can convert to/from SVG path strings
- **Type Safe**: Full TypeScript support with comprehensive interfaces
- **UI-Friendly**: Fast callbacks and efficient updates for real-time editing

## Installation

```bash
npm install @openmarch/core
```

## Interactive Control Points

The library now supports interactive control point editing, perfect for UI applications where users need to modify path shapes by dragging control points.

### Quick Start with Control Points

```typescript
import { Path, Line, CubicCurve, ControlPointManager } from "@openmarch/core";

// Create a path with a line and a curve
const path = new Path([
  new Line({ x: 0, y: 0 }, { x: 100, y: 0 }),
  new CubicCurve(
    { x: 100, y: 0 }, // start
    { x: 150, y: -50 }, // control1
    { x: 200, y: 50 }, // control2
    { x: 250, y: 0 }, // end
  ),
]);

// Create a control point manager
const manager = new ControlPointManager(path, {
  visible: true,
  handleRadius: 8,
  handleColor: "#4A90E2",
  selectedColor: "#FF6B6B",
});

// Get all control points
const controlPoints = manager.getAllControlPoints();
console.log(`Path has ${controlPoints.length} control points`);

// Move a control point (only recalculates the affected segment)
const success = manager.moveControlPoint("cp-1-control1", { x: 140, y: -60 });

// Add a callback for real-time updates
manager.addMoveCallback((controlPointId, newPoint) => {
  console.log(`Control point ${controlPointId} moved to:`, newPoint);
  // Update your UI here - the path is already updated efficiently
  renderPath(manager.path);
});
```

### Control Point Types

Different segment types expose different control points:

- **Line**: `start`, `end`
- **Arc**: `start`, `end`, `center`
- **CubicCurve**: `start`, `control1`, `control2`, `end`
- **Spline**: `spline-point` (for each control point in the array)

### Efficient Updates

The control point system is designed for performance:

```typescript
// Only the affected segment is recalculated
manager.moveControlPoint("cp-1-control1", newPoint);

// Batch updates for multiple control points
manager.moveControlPoints([
  { id: "cp-1-control1", point: { x: 140, y: -60 } },
  { id: "cp-1-control2", point: { x: 190, y: 40 } },
]);

// Hit testing for UI interactions
const controlPoint = manager.getControlPointAt({ x: 150, y: -50 }, 10);
if (controlPoint) {
  console.log(`Found control point: ${controlPoint.id}`);
}
```

### UI Integration Example

```typescript
// Example for canvas/SVG-based UI
class PathEditor {
  private manager: ControlPointManager;
  private isDragging = false;
  private draggedControlPoint: string | null = null;

  constructor(path: Path) {
    this.manager = new ControlPointManager(path);
    this.manager.addMoveCallback(this.onControlPointMove.bind(this));
  }

  onMouseDown(point: { x: number; y: number }) {
    const controlPoint = this.manager.getControlPointAt(point, 10);
    if (controlPoint) {
      this.isDragging = true;
      this.draggedControlPoint = controlPoint.id;
    }
  }

  onMouseMove(point: { x: number; y: number }) {
    if (this.isDragging && this.draggedControlPoint) {
      // This efficiently updates only the affected segment
      this.manager.moveControlPoint(this.draggedControlPoint, point);
    }
  }

  onMouseUp() {
    this.isDragging = false;
    this.draggedControlPoint = null;
  }

  private onControlPointMove(id: string, point: { x: number; y: number }) {
    // Redraw only what's necessary
    this.renderPath();
    this.renderControlPoints();
  }

  renderPath() {
    const svgPath = this.manager.path.toSvgString();
    // Update your SVG/canvas with the new path
  }

  renderControlPoints() {
    const controlPoints = this.manager.getAllControlPoints();
    // Render control point handles in your UI
    controlPoints.forEach((cp) => {
      this.drawControlPointHandle(cp.point, cp.id === this.draggedControlPoint);
    });
  }
}
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
import { Path, Line, Arc, CubicCurve, Spline } from "@openmarch/core";

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

// Add a spline segment
path.addSegment(
  Spline.fromPoints([
    { x: 35, y: 15 },
    { x: 40, y: 10 },
    { x: 45, y: 20 },
    { x: 50, y: 15 },
  ]),
);

// Enable interactive editing
const manager = path.createControlPointManager();
```

### Working with Splines

```typescript
// Create a Catmull-Rom spline
const catmullRomSpline = Spline.fromPoints(
  [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 30, y: 10 },
    { x: 40, y: 30 },
  ],
  0.5, // tension
  false, // not closed
);

// Create a B-spline with custom parameters
const bSpline = Spline.createBSpline(
  [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 30, y: 10 },
    { x: 40, y: 30 },
  ],
  3, // degree
  [0, 0, 0, 0, 1, 1, 1, 1], // knot vector
  [1, 1, 1, 1], // weights (optional)
);

// Interactive spline editing
const splinePath = Path.fromSpline(catmullRomSpline);
const splineManager = splinePath.createControlPointManager();

// Each control point in the spline can be moved independently
splineManager.moveControlPoint("cp-0-spline-point-1", { x: 15, y: 25 });
```

### JSON Serialization with Control Points

```typescript
// Serialize path with all original data preserved
const jsonString = path.toJson();

// Deserialize - all segment types and their specific data are restored
const restoredPath = Path.fromJson(jsonString);

// Control points work immediately on restored paths
const restoredManager = restoredPath.createControlPointManager();
```

### SVG Integration

```typescript
// Convert to SVG (approximates splines as line segments)
const svgPathString = path.toSvgString();

// Parse from SVG (loses spline information)
const pathFromSvg = Path.fromSvgString("M 0 0 L 10 10 C 15 5 20 15 25 10");

// Even SVG-parsed paths support control points
const svgManager = pathFromSvg.createControlPointManager();
```

## Advanced Control Point Features

### Custom Configuration

```typescript
const manager = new ControlPointManager(path, {
  visible: true,
  handleRadius: 12,
  handleColor: "#2196F3",
  selectedColor: "#FF5722",
  showControlLines: true, // Show lines connecting bezier control points
  controlLineColor: "#E0E0E0",
});
```

### Batch Operations

```typescript
// Move multiple control points efficiently
const updates = [
  { id: "cp-0-start", point: { x: 5, y: 5 } },
  { id: "cp-0-end", point: { x: 95, y: 5 } },
  { id: "cp-1-control1", point: { x: 120, y: -30 } },
];

manager.moveControlPoints(updates);
```

### Real-time Callbacks

```typescript
// Add multiple callbacks for different purposes
manager.addMoveCallback((id, point) => {
  // Update UI
  updateControlPointVisual(id, point);
});

manager.addMoveCallback((id, point) => {
  // Log for undo/redo system
  logPathChange(manager.path.toJson());
});

manager.addMoveCallback((id, point) => {
  // Real-time collaboration
  broadcastPathUpdate(id, point);
});
```

## API Reference

### ControlPointManager

- `moveControlPoint(id, newPoint)` - Move a single control point
- `moveControlPoints(updates)` - Move multiple control points in batch
- `getAllControlPoints()` - Get all control points
- `getControlPoint(id)` - Get a specific control point
- `getControlPointAt(point, tolerance)` - Hit testing for UI interactions
- `addMoveCallback(callback)` - Add callback for control point moves
- `addSegment(segment)` - Add segment and rebuild control points
- `removeSegment(index)` - Remove segment and rebuild control points

### Control Point Structure

```typescript
interface ControlPoint {
  id: string; // Unique identifier
  point: Point; // Current position
  segmentIndex: number; // Which segment this belongs to
  type: ControlPointType; // Type of control point
  pointIndex?: number; // Index for spline points
}
```

## Performance Notes

- Only affected segments are recalculated when control points move
- Batch operations are optimized for multiple simultaneous updates
- Control point lookup uses efficient spatial indexing
- Callbacks are called after all updates are complete
- Path serialization preserves all original segment data

## License

MIT License - see LICENSE file for details.
