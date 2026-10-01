import { fabric } from "fabric";
import { NoControls } from "@/components/canvas/CanvasConstants";
import { FieldProperties, rgbaToString } from "@openmarch/core";
import { RgbaColor } from "@uiw/react-color";
import { DEFAULT_PATHWAY_STROKE_WIDTH } from "./Pathway";

/**
 * A marcher's path in timeline mode (docs/timeline/phases/07-page-parity.md P7.10): a polyline
 * sampled from the resolver, so arcs and follow-the-leader moves draw as the curve the marcher
 * walks. Page mode keeps drawing straight `Pathway` lines and never creates one of these.
 */
export default class TimelinePathway extends fabric.Polyline {
    /** The grid line offset the marcher dots, midpoints and endpoints use */
    static readonly gridOffset = FieldProperties.GRID_STROKE_WIDTH / 2;

    /** The marcher this pathway is for */
    marcherId: number;

    constructor({
        marcherId,
        color = "black",
        strokeWidth = DEFAULT_PATHWAY_STROKE_WIDTH,
    }: {
        marcherId: number;
        color?: string;
        strokeWidth?: number;
    }) {
        super(
            [
                { x: 0, y: 0 },
                { x: 0, y: 0 },
            ],
            {
                stroke: color,
                strokeWidth,
                fill: "",
                visible: false,
                objectCaching: true,
                ...NoControls,
            },
        );
        this.marcherId = marcherId;
    }

    setColor(color: RgbaColor): void {
        this.set("stroke", rgbaToString(color));
    }

    hide(): void {
        if (this.visible !== false) this.set("visible", false);
    }

    show(): void {
        if (this.visible !== true) this.set("visible", true);
    }

    /** Replaces the polyline's points and recomputes its bounds. */
    updatePoints(points: readonly { x: number; y: number }[]): void {
        const next =
            points.length >= 2
                ? points
                : [points[0] ?? { x: 0, y: 0 }, points[0] ?? { x: 0, y: 0 }];
        // Offset like the marcher dots, midpoints and endpoints, so the path runs through them
        const offset = TimelinePathway.gridOffset;
        this.points = next.map(
            (p) => new fabric.Point(p.x + offset, p.y + offset),
        );
        // fabric 5 keeps left/top/pathOffset from construction; recompute them for the new points
        (
            this as unknown as {
                _setPositionDimensions: (options: object) => void;
            }
        )._setPositionDimensions({});
        this.dirty = true;
        this.setCoords();
    }
}
