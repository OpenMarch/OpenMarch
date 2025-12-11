import { useState } from "react";
import { Path, Line } from "@openmarch/core";
import { Button, InfoNote } from "@openmarch/ui";
import FabricCanvas from "./components/FabricCanvas";
import PathEditor from "./components/PathEditor";
import "./App.css";

function App() {
    const [canvasReady, setCanvasReady] = useState<boolean>(false);
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);

    const handleCanvasReady = (fabricCanvas: fabric.Canvas) => {
        setCanvas(fabricCanvas);
        setCanvasReady(true);
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

            <div className="canvas-container flex gap-6">
                <div className="flex-1">
                    <FabricCanvas onCanvasReady={handleCanvasReady} />
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
                </div>
            </div>

            <div className="mt-6">
                <PathEditor canvas={canvas} />
            </div>
        </div>
    );
}

export default App;
