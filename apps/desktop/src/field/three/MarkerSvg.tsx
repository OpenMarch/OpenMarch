import type { SVGProps } from "react";
import { crossLineWidth, markerPath, type MarkerShape } from "../markerShape";

/**
 * A marker in a marcher's shape for the SVG overlay (`markerShape.ts`): the outline filled with
 * `fill` and stroked with `stroke`, or, for an X, its two lines in `fill`. Other props (opacity,
 * test ids, a title) pass through to the path.
 */
export default function MarkerSvg({
    shape,
    x,
    y,
    r,
    fill,
    stroke,
    strokeWidth,
    children,
    ...rest
}: {
    shape: MarkerShape;
    x: number;
    y: number;
    /** The radius of the marcher it stands for */
    r: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
} & Omit<SVGProps<SVGPathElement>, "d" | "fill" | "stroke" | "strokeWidth">) {
    const cross = shape === "cross";
    return (
        <path
            d={markerPath(shape, x, y, r)}
            fill={cross ? "none" : fill}
            stroke={cross ? fill : stroke}
            strokeWidth={cross ? crossLineWidth(r) : strokeWidth}
            strokeLinejoin="miter"
            data-shape={shape}
            {...rest}
        >
            {children}
        </path>
    );
}
