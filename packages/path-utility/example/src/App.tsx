import { useEffect, useState } from "react";
import { Path, Line } from "@openmarch/path-utility";
import { Button, InfoNote, DangerNote } from "@openmarch/ui";
import FabricCanvas from "./components/FabricCanvas";
import "./App.css";

function App() {
    const [path, setPath] = useState<Path>(new Path());
    const [pathData, setPathData] = useState<string>("");
    const [canvasReady, setCanvasReady] = useState(false);

    useEffect(() => {
        if (canvasReady) {
            setPathData(path.toSvgString());
        }
    }, [path, canvasReady]);

    const addRandomLine = () => {
        if (!canvasReady) return;

        const x1 = Math.random() * 600 + 100;
        const y1 = Math.random() * 400 + 100;
        const x2 = Math.random() * 600 + 100;
        const y2 = Math.random() * 400 + 100;

        const lineSegment = new Line({ x: x1, y: y1 }, { x: x2, y: y2 });
        const newPath = new Path([...path.segments, lineSegment]);
        setPath(newPath);
    };

    const clearPath = () => {
        if (!canvasReady) return;
        setPath(new Path());
    };

    const connectToLastPoint = () => {
        if (path.segments.length === 0 || !canvasReady) return;

        const lastPoint = path.getLastPoint();
        if (!lastPoint) return;

        const x = Math.random() * 600 + 100;
        const y = Math.random() * 400 + 100;

        const lineSegment = new Line(lastPoint, { x, y });
        const newPath = new Path([...path.segments, lineSegment]);
        setPath(newPath);
    };

    return (
        <div className="app bg-bg-1 min-h-screen p-8">
            <div className="header">
                <h1 className="text-text mb-4 text-2xl font-bold">
                    Path Utility - Line Segments Example
                </h1>
                <p className="text-text-subtitle mb-4">
                    Draw lines by clicking and dragging, or use the buttons
                    below
                </p>
            </div>

            <div className="controls mb-6 flex gap-4">
                <Button
                    onClick={addRandomLine}
                    variant="primary"
                    disabled={!canvasReady}
                >
                    Add Random Line
                </Button>
                <Button
                    onClick={connectToLastPoint}
                    variant="secondary"
                    disabled={!canvasReady}
                >
                    Connect to Last Point
                </Button>
                <Button
                    onClick={clearPath}
                    variant="red"
                    disabled={!canvasReady}
                >
                    Clear All
                </Button>
            </div>

            <div className="canvas-container flex gap-6">
                <div className="flex-1">
                    <FabricCanvas />
                </div>
                <div className="canvas-info bg-fg-2 rounded-6 border-stroke w-80 border p-6">
                    <InfoNote>
                        <strong>Instructions:</strong>
                    </InfoNote>
                    <ul className="text-text mt-4 mb-6 list-inside list-disc">
                        <li>Click and drag to draw lines</li>
                        <li>
                            Drag control points (red/blue circles) to modify
                            lines
                        </li>
                        <li>
                            Use buttons to add random lines or connect to
                            existing points
                        </li>
                    </ul>
                    <div className="mb-4">
                        <p className="text-text mb-2 font-semibold">
                            Path Info:
                        </p>
                        <p className="text-text-subtitle">
                            Total segments: {path.segments.length}
                        </p>
                        <p className="text-text-subtitle">
                            Total length: {path.getTotalLength().toFixed(2)}px
                        </p>
                    </div>
                    <div>
                        <p className="text-text mb-2 font-semibold">
                            SVG Path:
                        </p>
                        <code className="svg-path bg-modal text-text rounded-4 block overflow-x-auto p-3 text-sm">
                            {pathData || "No path yet"}
                        </code>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
