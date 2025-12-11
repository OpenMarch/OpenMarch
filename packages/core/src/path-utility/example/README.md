# Path Utility - Fabric.js Line Segments Example

This example demonstrates how to use the OpenMarch Path Utility with Fabric.js to create interactive line segments that can be added to each other.

## Features

- **Interactive Drawing**: Click and drag to draw lines on the canvas
- **Line Segments**: Each line is represented as a Line segment in the Path utility
- **Connected Paths**: Lines can be connected to existing endpoints to create continuous paths
- **Real-time Updates**: Changes in Fabric.js are synchronized with the Path utility
- **Control Points**: Drag control points to modify line positions
- **SVG Export**: View the generated SVG path string in real-time

## How It Works

### Drawing Lines

1. Click and drag on the canvas to draw a line
2. The line is automatically converted to a Line segment
3. The segment is added to the Path object
4. The canvas is updated to show the new line with control points

### Adding Lines Programmatically

- **Add Random Line**: Creates a random line segment anywhere on the canvas
- **Connect to Last Point**: Creates a line from the last endpoint to a random position
- **Clear All**: Removes all lines and resets the path

### Interactive Editing

- **Red circles**: Start point control points
- **Blue circles**: End point control points
- Drag control points to modify line positions
- Changes are automatically reflected in the Path utility

## Technical Implementation

### Path Utility Integration

- Uses `Line` class from `@openmarch/core`
- Creates `Path` objects to manage multiple segments
- Maintains synchronization between visual representation and data model

### Fabric.js Canvas

- 800x600 pixel canvas with light background
- Interactive drawing with mouse events
- Real-time visual feedback during drawing
- Control points for segment manipulation

### State Management

- React state for Path objects and drawing state
- useEffect hooks for canvas initialization and updates
- Event handlers for mouse interactions and object modifications

## Running the Example

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the development server:

   ```bash
   pnpm dev
   ```

3. Open your browser to the displayed URL

## Code Structure

- `App.tsx`: Main component with Fabric.js integration
- `App.css`: Styling for the interface
- `index.css`: Base styles and CSS reset

## Key Functions

- `handleMouseDown/Move/Up`: Drawing interaction handlers
- `updateCanvas`: Synchronizes Path utility with Fabric.js
- `handleObjectModified`: Handles control point modifications
- `addRandomLine/connectToLastPoint`: Programmatic line addition

## Dependencies

- `fabric`: Canvas manipulation and drawing
- `@openmarch/core`: Path and line segment management
- `react`: UI framework
- `typescript`: Type safety

This example showcases how the Path Utility can be integrated with interactive canvas libraries to create powerful drawing applications with mathematical precision and real-time updates.
