# Path Utility Examples

This directory contains examples demonstrating how to use the path utility's control point system for interactive path editing.

## Quick Start Example

Here's a simple example showing the core functionality:

```typescript
import {
  Path,
  Line,
  CubicCurve,
  Spline,
  ControlPointManager,
} from "@openmarch/path-utility";

// Create a path with different segment types
const path = new Path([
  new Line({ x: 0, y: 100 }, { x: 100, y: 100 }),
  new CubicCurve(
    { x: 100, y: 100 },
    { x: 150, y: 50 }, // control1
    { x: 200, y: 150 }, // control2
    { x: 250, y: 100 },
  ),
  Spline.fromPoints([
    { x: 250, y: 100 },
    { x: 300, y: 75 },
    { x: 350, y: 125 },
    { x: 400, y: 100 },
  ]),
]);

// Create control point manager
const manager = new ControlPointManager(path, {
  handleColor: "#4A90E2",
  selectedColor: "#FF6B6B",
  handleRadius: 8,
});

// Set up real-time callback for UI updates
manager.addMoveCallback((controlPointId, newPoint) => {
  console.log(
    `Control point ${controlPointId} moved to (${newPoint.x}, ${newPoint.y})`,
  );

  // Update your UI here - the path is already updated efficiently!
  updateUI(manager.path.toSvgString());
});

// Move a control point (only recalculates the affected segment)
manager.moveControlPoint("cp-1-control1", { x: 140, y: 40 });

// Get all control points for rendering
const allControlPoints = manager.getAllControlPoints();
console.log(`Path has ${allControlPoints.length} interactive control points`);

// Hit testing for mouse interactions
function onMouseClick(mouseX: number, mouseY: number) {
  const controlPoint = manager.getControlPointAt({ x: mouseX, y: mouseY }, 10);
  if (controlPoint) {
    console.log(
      `Clicked on ${controlPoint.type} control point of segment ${controlPoint.segmentIndex}`,
    );
  }
}

// Batch updates for better performance
manager.moveControlPoints([
  { id: "cp-1-control1", point: { x: 160, y: 60 } },
  { id: "cp-1-control2", point: { x: 190, y: 140 } },
]);
```

## Key Features Demonstrated

### 1. **Efficient Updates**

- Only the affected segment is recalculated when a control point moves
- Batch operations optimize multiple simultaneous updates
- Immutable updates preserve path integrity

### 2. **UI-Friendly Design**

- Fast hit testing for mouse interactions
- Real-time callbacks for smooth UI updates
- Configurable visual styling

### 3. **Comprehensive Segment Support**

- **Lines**: Start/end points
- **Cubic Curves**: Start, control1, control2, end points
- **Arcs**: Start, end, center points
- **Splines**: Individual control points in the spline array

### 4. **Performance Optimized**

```typescript
// Instead of this (recalculates entire path):
const newPath = recreateEntirePath(modifications);

// The control point system does this (only affected segment):
manager.moveControlPoint("cp-1-control1", newPoint); // Only segment 1 updated
```

## Integration Examples

### Canvas-based Editor (interactive-path-editor.ts)

Complete example showing how to integrate with HTML5 Canvas for a full interactive path editor with:

- Mouse drag interactions
- Visual control point handles
- Control lines for Bézier curves
- Hover effects and selection states

### React Component Example

```typescript
import { useEffect, useRef, useState } from 'react';
import { ControlPointManager } from '@openmarch/path-utility';

function PathEditor({ initialPath }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [manager, setManager] = useState<ControlPointManager | null>(null);
    const [pathLength, setPathLength] = useState(0);

    useEffect(() => {
        if (!canvasRef.current) return;

        const pathManager = new ControlPointManager(initialPath);
        pathManager.addMoveCallback(() => {
            setPathLength(pathManager.path.getTotalLength());
            redrawCanvas();
        });

        setManager(pathManager);
    }, [initialPath]);

    const handleMouseMove = (event: MouseEvent) => {
        if (manager && isDragging) {
            const point = getMousePosition(event);
            manager.moveControlPoint(draggedControlPointId, point);
        }
    };

    return (
        <div>
            <canvas ref={canvasRef} onMouseMove={handleMouseMove} />
            <div>Path Length: {pathLength.toFixed(2)}</div>
        </div>
    );
}
```

## Advanced Usage

### Custom Control Point Styling

```typescript
const manager = new ControlPointManager(path, {
  visible: true,
  handleRadius: 12,
  handleColor: "#2196F3",
  selectedColor: "#FF5722",
  showControlLines: true,
  controlLineColor: "#E0E0E0",
});
```

### Undo/Redo System

```typescript
class PathHistory {
  private history: string[] = [];
  private currentIndex = -1;

  constructor(private manager: ControlPointManager) {
    // Save initial state
    this.saveState();

    // Listen for changes
    manager.addMoveCallback(() => {
      this.saveState();
    });
  }

  saveState() {
    const json = this.manager.path.toJson();
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(json);
    this.currentIndex++;
  }

  undo() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      const path = Path.fromJson(this.history[this.currentIndex]);
      this.manager = new ControlPointManager(path, this.manager.config);
    }
  }
}
```

### Real-time Collaboration

```typescript
manager.addMoveCallback((controlPointId, point) => {
  // Broadcast changes to other users
  websocket.send(
    JSON.stringify({
      type: "control-point-moved",
      id: controlPointId,
      point: point,
      timestamp: Date.now(),
    }),
  );
});

websocket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "control-point-moved") {
    manager.moveControlPoint(data.id, data.point);
  }
};
```

## Performance Characteristics

- **Control Point Updates**: O(1) - only affected segment recalculated
- **Hit Testing**: O(n) where n = number of control points
- **Batch Updates**: Optimized to minimize redundant calculations
- **Memory Usage**: Immutable updates create new segment instances only when needed

## File Structure

- `interactive-path-editor.ts` - Complete Canvas-based editor example
- `README.md` - This documentation file

Run the examples with:

```bash
npm run build
node -r ts-node/register examples/interactive-path-editor.ts
```
