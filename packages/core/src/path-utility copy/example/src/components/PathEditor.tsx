import { useState } from "react";
import { fabric } from "fabric";
import { Path, Line, type Point, Spline } from "../../../../path-utility copy";
import OmPath from "../fabric/omPath";
import {
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    Slider,
} from "@openmarch/ui";

type PathwayType = "line" | "spline";

/** Alpha for spline: 0 = uniform, 0.5 = centripetal, 1 = chordal */
const ALPHA_LABELS: Record<number, string> = {
    0: "Uniform",
    0.5: "Centripetal",
    1: "Chordal",
};

// const SPLINE_SAMPLE_POINTS = [
//     { x: 100, y: 150 },
//     { x: 200, y: 80 },
//     { x: 280, y: 200 },
//     { x: 350, y: 350 },
//     { x: 200, y: 400 },
// ];

// const LINE_SAMPLE_POINTS = [
//     { x: 200, y: 400 },
//     { x: 150, y: 300 },
// ];
const SPLINE_SAMPLE_POINTS: Point[] = [
    [0, 0],
    [200, 300],
    [0, 150],
    [-50, 400],
];

interface PathEditorProps {
    canvas: fabric.Canvas | null;
}

const PathEditor: React.FC<PathEditorProps> = ({ canvas }) => {
    const [paths, setPaths] = useState<OmPath<fabric.Canvas>[]>([]);
    const [currentPath, setCurrentPath] = useState<Path | null>(null);
    const [pathwayType, setPathwayType] = useState<PathwayType>("spline");
    const [splineAlpha, setSplineAlpha] = useState(0.5);

    const createNewPath = () => {
        if (!canvas) return;

        let segments: Path["segments"];
        switch (pathwayType) {
            // case "spline":
            //     segments = [
            //         new Spline(SPLINE_SAMPLE_POINTS, splineAlpha, false),
            //     ];
            //     break;
            case "line":
                segments = [new Line(SPLINE_SAMPLE_POINTS)];
                break;
            default:
                segments = [new Line(SPLINE_SAMPLE_POINTS)];
        }

        const newPath = new Path([100, 50], segments);
        const omPath = new OmPath(newPath, canvas, {
            visible: true,
            controlPointProps: {
                size: 32,
                color: "blue",
                strokeWidth: 2,
                filled: false,
            },
            splitPointProps: {
                size: 8,
                color: "blue",
                strokeWidth: 0,
                filled: true,
            },
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

            <div className="controls mb-4 flex flex-wrap items-center gap-2">
                <Select
                    value={pathwayType}
                    onValueChange={(value) =>
                        setPathwayType(value as PathwayType)
                    }
                >
                    <SelectTriggerButton label="Pathway type" />
                    <SelectContent>
                        <SelectItem value="line">Line</SelectItem>
                        <SelectItem value="spline">Spline</SelectItem>
                    </SelectContent>
                </Select>
                {pathwayType === "spline" && (
                    <div className="flex flex-col gap-1">
                        <span className="text-text-subtitle text-body">
                            Alpha:{" "}
                            {ALPHA_LABELS[splineAlpha] ??
                                splineAlpha.toFixed(1)}
                        </span>
                        <Slider
                            min={0}
                            max={1}
                            step={0.1}
                            value={[splineAlpha]}
                            onValueChange={([v]) => setSplineAlpha(v ?? 0.5)}
                            aria-label="Spline alpha"
                        />
                    </div>
                )}
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
                    <div className="current-path-info space-y-1">
                        <p className="text-text-subtitle">
                            Segment type:{" "}
                            {currentPath.segments.map((s) => s.type).join(", ")}
                        </p>
                        <p className="text-text-subtitle">
                            Current Path Segments: {currentPath.segments.length}
                        </p>
                        <p className="text-text-subtitle">
                            Current Path Length:{" "}
                            {currentPath.getTotalLength().toFixed(2)}px
                        </p>
                        <p className="text-text-subtitle break-all">
                            SVG: {currentPath.toSvgString()}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PathEditor;
