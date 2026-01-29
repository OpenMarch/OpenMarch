import { Path, Line } from "@openmarch/core";

// Demo of the Path Utility functionality
console.log("🚀 Path Utility Demo - Line Segments\n");

// Create a new path
const path = new Path();
console.log("📏 Created new empty path");
console.log(`   Total segments: ${path.segments.length}`);
console.log(`   Total length: ${path.getTotalLength().toFixed(2)}px`);
console.log(`   SVG: "${path.toSvgString()}"\n`);

// Add a line segment
const line1 = new Line({ x: 0, y: 0 }, { x: 100, y: 100 });
path.addSegment(line1);
console.log("➕ Added first line segment");
console.log(`   Start: (${line1.startPoint.x}, ${line1.startPoint.y})`);
console.log(`   End: (${line1.endPoint.x}, ${line1.endPoint.y})`);
console.log(`   Length: ${line1.getLength().toFixed(2)}px`);
console.log(`   Total segments: ${path.segments.length}`);
console.log(`   Total length: ${path.getTotalLength().toFixed(2)}px`);
console.log(`   SVG: "${path.toSvgString()}"\n`);

// Add another line segment connected to the first
const lastPoint = path.getLastPoint();
if (lastPoint) {
    const line2 = new Line(lastPoint, { x: 200, y: 0 });
    path.addSegment(line2);
    console.log("🔗 Added second line segment (connected to first)");
    console.log(`   Start: (${line2.startPoint.x}, ${line2.startPoint.y})`);
    console.log(`   End: (${line2.endPoint.x}, ${line2.endPoint.y})`);
    console.log(`   Length: ${line2.getLength().toFixed(2)}px`);
    console.log(`   Total segments: ${path.segments.length}`);
    console.log(`   Total length: ${path.getTotalLength().toFixed(2)}px`);
    console.log(`   SVG: "${path.toSvgString()}"\n`);
}

// Add a third line to create a triangle
const line3 = new Line({ x: 200, y: 0 }, { x: 0, y: 0 });
path.addSegment(line3);
console.log("🔺 Added third line segment (closing the triangle)");
console.log(`   Start: (${line3.startPoint.x}, ${line3.startPoint.y})`);
console.log(`   End: (${line3.endPoint.x}, ${line3.endPoint.y})`);
console.log(`   Length: ${line3.getLength().toFixed(2)}px`);
console.log(`   Total segments: ${path.segments.length}`);
console.log(`   Total length: ${path.getTotalLength().toFixed(2)}px`);
console.log(`   SVG: "${path.toSvgString()}"\n`);

// Demonstrate getting points at specific distances
console.log("📍 Points at specific distances along the path:");
for (let i = 0; i <= 10; i++) {
    const distance = (path.getTotalLength() * i) / 10;
    const point = path.getPointAtLength(distance);
    console.log(
        `   ${distance.toFixed(1)}px: (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`,
    );
}

// Show JSON representation
console.log("\n💾 JSON representation:");
console.log(path.toJson());

// Demonstrate bounds calculation
console.log("\n📐 Bounds calculation:");
const bounds = path.getBoundsByControlPoints();
if (bounds) {
    console.log(`   Min X: ${bounds.minX}`);
    console.log(`   Min Y: ${bounds.minY}`);
    console.log(`   Max X: ${bounds.maxX}`);
    console.log(`   Max Y: ${bounds.maxY}`);
    console.log(`   Width: ${bounds.width}`);
    console.log(`   Height: ${bounds.height}`);
    console.log(
        "   Note: Bounds are calculated from all control points (start/end points of each segment)",
    );
} else {
    console.log("   No bounds available (empty path)");
}

console.log(
    "\n✅ Demo complete! The path utility successfully manages line segments and provides mathematical operations.",
);
