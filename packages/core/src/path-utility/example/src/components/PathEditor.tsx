import { useState } from "react";
import { fabric } from "fabric";
import {
    Arc,
    CubicCurve,
    Line,
    Path,
    QuadraticCurve,
    Spline,
} from "@openmarch/core";
import OmPath from "../fabric/omPath";
import { Button } from "@openmarch/ui";

interface PathEditorProps {
    canvas: fabric.Canvas | null;
}

const PathEditor: React.FC<PathEditorProps> = ({ canvas }) => {
    const [paths, setPaths] = useState<OmPath<fabric.Canvas>[]>([]);
    const [currentPath, setCurrentPath] = useState<Path | null>(null);

    const createNewPath = () => {
        if (!canvas) return;

        const newPath = new Path([
            new Arc({ x: 150, y: 100 }, 100, 100, 0, 0, 0, { x: 400, y: 500 }),
            // new Line({ x: 200, y: 200 }, { x: 300, y: 100 }),
            // new CubicCurve(
            //     { x: 300, y: 100 },
            //     { x: 400, y: 200 },
            //     { x: 450, y: 200 },
            //     { x: 500, y: 100 },
            // ),
            // new QuadraticCurve(
            //     { x: 500, y: 100 },
            //     { x: 400, y: 450 },
            //     { x: 450, y: 400 },
            // ),
            Spline.fromPoints(
                [
                    { x: 200, y: 50 },
                    { x: 150, y: 100 },
                    { x: 200, y: 400 },
                    { x: 300, y: 400 },
                ],
                0.5,
                false,
            ),
        ]);
        const omPath = new OmPath(newPath, canvas, {
            stroke: "red",
            strokeWidth: 2,
            fill: "transparent",
        });

        setPaths((prev) => [...prev, omPath]);
        setCurrentPath(newPath);
    };

    const clearAllPaths = () => {
        paths.forEach((omPath) => omPath.hide());
        setPaths([]);
        setCurrentPath(null);
    };

    return (
        <div className="path-editor bg-fg-2 rounded-6 border-stroke border p-4">
            <h3 className="text-text mb-4 text-lg font-semibold">
                Path Editor
            </h3>

            <div className="controls mb-4 flex gap-2">
                <Button
                    onClick={createNewPath}
                    variant="primary"
                    disabled={!canvas}
                >
                    Create New Path
                </Button>
                <Button
                    onClick={clearAllPaths}
                    variant="red"
                    disabled={paths.length === 0}
                >
                    Clear All Paths
                </Button>
            </div>

            <div className="path-info">
                <p className="text-text-subtitle mb-2">
                    Active Paths: {paths.length}
                </p>
                {currentPath && (
                    <div className="current-path-info">
                        <p className="text-text-subtitle">
                            Current Path Segments: {currentPath.segments.length}
                        </p>
                        <p className="text-text-subtitle">
                            Current Path Length:{" "}
                            {currentPath.getTotalLength().toFixed(2)}px
                        </p>
                        <p className="text-text-subtitle">
                            SVG: {currentPath.toSvgString()}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PathEditor;
