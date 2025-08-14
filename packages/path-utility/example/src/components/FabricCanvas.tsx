import { useEffect, useRef } from "react";
import { fabric } from "fabric";

const FabricCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

    // Initialize Fabric.js canvas
    useEffect(() => {
        if (canvasRef.current && !fabricCanvasRef.current) {
            console.log("FabricCanvas: Initializing canvas...");
            try {
                // Ensure the canvas element is properly set up
                const canvasElement = canvasRef.current;

                // Wait for next tick to ensure canvas is ready
                try {
                    const canvas = new fabric.Canvas(canvasElement, {
                        width: 1000,
                        height: 600,
                    });

                    fabricCanvasRef.current = canvas;
                    // Draw a simple rectangle
                    const rect = new fabric.Rect({
                        left: 100,
                        top: 100,
                        width: 200,
                        height: 100,
                        fill: "#ff0000",
                        stroke: "#000000",
                        strokeWidth: 2,
                    });
                    canvas.add(rect);
                    canvas.renderAll();

                    // Initial canvas update
                } catch (error) {
                    console.error(
                        "Failed to initialize Fabric.js canvas:",
                        error,
                    );
                }
            } catch (error) {
                console.error("Failed to set up canvas element:", error);
            }
        }
    }, []);

    return (
        <canvas ref={canvasRef} className="border-stroke rounded-6 border" />
    );
};

export default FabricCanvas;
