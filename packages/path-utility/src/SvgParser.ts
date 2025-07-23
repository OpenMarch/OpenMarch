import { IPathSegment } from "./interfaces";

/**
 * Parses an SVG path `d` attribute string into an array of path segments.
 * Note: This is a simplified placeholder implementation. A robust version
 * would need to handle all SVG command types and variations.
 * @param d The SVG path data string.
 */
export function parseSvg(d: string): IPathSegment[] {
    // A full implementation would parse the `d` string and create
    // concrete classes for each segment type (Line, Curve, etc.).
    console.warn("parseSvg is not implemented", d);
    return [];
}
