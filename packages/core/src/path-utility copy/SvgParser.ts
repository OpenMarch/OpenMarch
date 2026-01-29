import { IControllableSegment, Point } from "./interfaces";
import { Arc } from "./segments/Arc";
import { CubicCurve } from "./segments/CubicCurve";
import { Line } from "./segments/Line";
import { QuadraticCurve } from "./segments/QuadraticCurve";

/**
 * Parses an SVG path `d` attribute string into an array of path segments.
 * Converts all commands to absolute coordinates.
 * @param d The SVG path data string.
 */
export function parseSvg(d: string): IControllableSegment[] {
    const commandTokens = d.match(/[a-df-z][^a-df-z]*/gi) || [];
    const segments: IControllableSegment[] = [];

    let currentPoint: Point = { x: 0, y: 0 };
    let subpathStart: Point = { x: 0, y: 0 };
    let lastControlPoint: Point | null = null;

    for (const token of commandTokens) {
        let command = token[0];
        const prevCommand = command;
        const args = (
            token
                .substring(1)
                .trim()
                .match(/[-.0-9]+/g) || []
        ).map(parseFloat);

        const isRelative = command === command.toLowerCase();

        if (command.toUpperCase() === "Z") {
            if (
                currentPoint.x !== subpathStart.x ||
                currentPoint.y !== subpathStart.y
            ) {
                segments.push(new Line(currentPoint, subpathStart));
            }
            currentPoint = { ...subpathStart };
            continue;
        }

        let i = 0;
        while (i < args.length) {
            let nextPoint: Point;

            // If a moveto is followed by multiple pairs of coordinates,
            // the subsequent pairs are treated as implicit lineto commands.
            if (command.toUpperCase() === "M" && i > 0) {
                command = isRelative ? "l" : "L";
            }

            switch (command.toUpperCase()) {
                case "M": {
                    // moveto
                    const x = args[i++];
                    const y = args[i++];
                    nextPoint = isRelative
                        ? { x: currentPoint.x + x, y: currentPoint.y + y }
                        : { x, y };
                    currentPoint = nextPoint;
                    subpathStart = nextPoint;
                    lastControlPoint = null;
                    break;
                }
                case "L": {
                    // lineto
                    const x = args[i++];
                    const y = args[i++];
                    nextPoint = isRelative
                        ? { x: currentPoint.x + x, y: currentPoint.y + y }
                        : { x, y };
                    segments.push(new Line(currentPoint, nextPoint));
                    currentPoint = nextPoint;
                    lastControlPoint = null;
                    break;
                }
                case "H": {
                    // horizontal lineto
                    const x = args[i++];
                    nextPoint = isRelative
                        ? { x: currentPoint.x + x, y: currentPoint.y }
                        : { x, y: currentPoint.y };
                    segments.push(new Line(currentPoint, nextPoint));
                    currentPoint = nextPoint;
                    lastControlPoint = null;
                    break;
                }
                case "V": {
                    // vertical lineto
                    const y = args[i++];
                    nextPoint = isRelative
                        ? { x: currentPoint.x, y: currentPoint.y + y }
                        : { x: currentPoint.x, y };
                    segments.push(new Line(currentPoint, nextPoint));
                    currentPoint = nextPoint;
                    lastControlPoint = null;
                    break;
                }
                case "Q": {
                    // quadratic bezier curveto
                    const cx = args[i++];
                    const cy = args[i++];
                    const x = args[i++];
                    const y = args[i++];

                    const c1 = isRelative
                        ? { x: currentPoint.x + cx, y: currentPoint.y + cy }
                        : { x: cx, y: cy };
                    nextPoint = isRelative
                        ? { x: currentPoint.x + x, y: currentPoint.y + y }
                        : { x, y };

                    segments.push(
                        new QuadraticCurve(currentPoint, c1, nextPoint),
                    );
                    currentPoint = nextPoint;
                    lastControlPoint = c1;
                    break;
                }
                case "C": {
                    // cubic bezier curveto
                    const cx1 = args[i++];
                    const cy1 = args[i++];
                    const cx2 = args[i++];
                    const cy2 = args[i++];
                    const x = args[i++];
                    const y = args[i++];

                    const c1 = isRelative
                        ? { x: currentPoint.x + cx1, y: currentPoint.y + cy1 }
                        : { x: cx1, y: cy1 };
                    const c2 = isRelative
                        ? { x: currentPoint.x + cx2, y: currentPoint.y + cy2 }
                        : { x: cx2, y: cy2 };
                    nextPoint = isRelative
                        ? { x: currentPoint.x + x, y: currentPoint.y + y }
                        : { x, y };

                    segments.push(
                        new CubicCurve(currentPoint, c1, c2, nextPoint),
                    );
                    currentPoint = nextPoint;
                    lastControlPoint = c2;
                    break;
                }
                case "S": {
                    // shorthand/smooth cubic curveto
                    const cx2 = args[i++];
                    const cy2 = args[i++];
                    const x = args[i++];
                    const y = args[i++];

                    const c2 = isRelative
                        ? { x: currentPoint.x + cx2, y: currentPoint.y + cy2 }
                        : { x: cx2, y: cy2 };
                    nextPoint = isRelative
                        ? { x: currentPoint.x + x, y: currentPoint.y + y }
                        : { x, y };

                    let c1: Point;
                    const isPrevCubic =
                        prevCommand.toUpperCase() === "C" ||
                        prevCommand.toUpperCase() === "S";

                    if (lastControlPoint && isPrevCubic) {
                        c1 = {
                            x: 2 * currentPoint.x - lastControlPoint.x,
                            y: 2 * currentPoint.y - lastControlPoint.y,
                        };
                    } else {
                        c1 = currentPoint;
                    }

                    segments.push(
                        new CubicCurve(currentPoint, c1, c2, nextPoint),
                    );
                    currentPoint = nextPoint;
                    lastControlPoint = c2;
                    break;
                }
                case "T": {
                    // shorthand/smooth quadratic curveto
                    const x = args[i++];
                    const y = args[i++];
                    nextPoint = isRelative
                        ? { x: currentPoint.x + x, y: currentPoint.y + y }
                        : { x, y };

                    let c1: Point;
                    const isPrevQuadratic =
                        prevCommand.toUpperCase() === "Q" ||
                        prevCommand.toUpperCase() === "T";

                    if (lastControlPoint && isPrevQuadratic) {
                        c1 = {
                            x: 2 * currentPoint.x - lastControlPoint.x,
                            y: 2 * currentPoint.y - lastControlPoint.y,
                        };
                    } else {
                        c1 = currentPoint;
                    }

                    segments.push(
                        new QuadraticCurve(currentPoint, c1, nextPoint),
                    );
                    currentPoint = nextPoint;
                    lastControlPoint = c1;
                    break;
                }
                case "A": {
                    // elliptical arc
                    const rx = args[i++];
                    const ry = args[i++];
                    const xAxisRotation = args[i++];
                    const largeArcFlag = args[i++] as 0 | 1;
                    const sweepFlag = args[i++] as 0 | 1;
                    const x = args[i++];
                    const y = args[i++];
                    nextPoint = isRelative
                        ? { x: currentPoint.x + x, y: currentPoint.y + y }
                        : { x, y };

                    if (rx === 0 || ry === 0) {
                        segments.push(new Line(currentPoint, nextPoint));
                    } else if (
                        currentPoint.x !== nextPoint.x ||
                        currentPoint.y !== nextPoint.y
                    ) {
                        segments.push(
                            new Arc(
                                currentPoint,
                                rx,
                                ry,
                                xAxisRotation,
                                largeArcFlag,
                                sweepFlag,
                                nextPoint,
                            ),
                        );
                    }

                    currentPoint = nextPoint;
                    lastControlPoint = null;
                    break;
                }
                default:
                    // Unsupported commands are ignored.
                    i = args.length;
            }
        }
    }
    return segments;
}
