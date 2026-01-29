import { useEffect, useRef } from "react";
import { fabric } from "fabric";

interface FabricCanvasProps {
    onCanvasReady: (canvas: fabric.Canvas) => void;
}

const FabricCanvas: React.FC<FabricCanvasProps> = ({ onCanvasReady }) => {
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

                    // Notify parent component that canvas is ready
                    onCanvasReady(canvas);

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
    }, [onCanvasReady]);

    return (
        <canvas ref={canvasRef} className="border-stroke rounded-6 border" />
    );
};

export default FabricCanvas;
