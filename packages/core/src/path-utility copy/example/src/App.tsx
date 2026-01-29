import { useState } from "react";
import { InfoNote } from "@openmarch/ui";
import FabricCanvas from "./components/FabricCanvas";
import PathEditor from "./components/PathEditor";
import "./App.css";

function App() {
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);

    const handleCanvasReady = (fabricCanvas: fabric.Canvas) => {
        setCanvas(fabricCanvas);
    };

    return (
        <div className="app bg-bg-1 min-h-screen p-8">
            <div className="header">
                <h1 className="text-text mb-4 text-2xl font-bold">
                    Path Utility - Spline Example
                </h1>
                <p className="text-text-subtitle mb-4">
                    Create paths with Arc or Spline (Catmull-Rom). Drag control
                    points to edit curves.
                </p>
            </div>

            <div className="canvas-container flex gap-6">
                <div className="flex-1">
                    <FabricCanvas onCanvasReady={handleCanvasReady} />
                </div>
                <div className="canvas-info bg-fg-2 rounded-6 border-stroke w-80 border p-6">
                    <InfoNote>
                        <strong>Instructions:</strong>
                    </InfoNote>
                    <ul className="text-text mt-4 mb-6 list-inside list-disc">
                        <li>Choose a pathway type (Arc or Spline)</li>
                        <li>
                            For Spline, set alpha: Uniform (0), Centripetal
                            (0.5), or Chordal (1)
                        </li>
                        <li>
                            Click &quot;Create New Path&quot; to add a path to
                            the canvas
                        </li>
                        <li>
                            Drag the red control points to reshape the spline
                        </li>
                    </ul>
                </div>
            </div>

            <div className="mt-6">
                <PathEditor canvas={canvas} />
            </div>
        </div>
    );
}

export default App;
