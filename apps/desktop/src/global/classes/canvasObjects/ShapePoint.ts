import { fabric } from "fabric";
import { VanillaPoint } from "./StaticMarcherShape";
import { SvgCommandEnum, Coordinate } from "./SvgCommand";

/**
 * Represents a single point in a shape path, with a command and coordinates.
 * The `ShapePoint` class provides methods to work with and manipulate these points.
 */
export class ShapePoint {
    command: SvgCommandEnum;
    coordinates: Coordinate[];

    private constructor(command: SvgCommandEnum, coordinates: Coordinate[]) {
        this.command = command;
        this.coordinates = coordinates;
    }

    static checkCommand(command: string): SvgCommandEnum {
        if (
            !Object.values(SvgCommandEnum).includes(command as SvgCommandEnum)
        ) {
            throw new Error(`Invalid command: ${command}`);
        }
        return command as SvgCommandEnum;
    }

    static checkCoordinatesWithCommand(
        command: SvgCommandEnum,
        coordinates: Coordinate[],
    ) {
        switch (command) {
            case SvgCommandEnum.MOVE:
            case SvgCommandEnum.LINE: {
                const expected = 1;
                if (coordinates.length !== expected) {
                    throw new Error(
                        `Invalid number of coordinates for ${command} command. Expected ${expected}, got ${coordinates.length}`,
                    );
                }
                break;
            }
            case SvgCommandEnum.QUADRATIC: {
                const expected = 2;
                if (coordinates.length !== expected) {
                    throw new Error(
                        `Invalid number of coordinates for ${command} command. Expected ${expected}, got ${coordinates.length}`,
                    );
                }
                break;
            }
            case SvgCommandEnum.CUBIC: {
                const expected = 3;
                if (coordinates.length !== expected) {
                    throw new Error(
                        `Invalid number of coordinates for ${command} command. Expected ${expected}, got ${coordinates.length}`,
                    );
                }
                break;
            }
            case SvgCommandEnum.CLOSE: {
                const expected = 0;
                if (coordinates.length !== 0) {
                    throw new Error(
                        `Invalid number of coordinates for ${command} command. Expected ${expected}, got ${coordinates.length}`,
                    );
                }
                break;
            }
        }
    }

    /**
     * Converts the ShapePoint to a string representation in SVG path format
     * @returns A string in the format "command x, y "
     */
    toString() {
        const array = this.toArray();
        return `${this.command} ${array.slice(1).join(" ")} `;
    }

    /**
     * Converts an array of ShapePoints into a single SVG path string
     * @param points Array of ShapePoint objects to convert
     * @returns Combined string of all points in SVG path format
     */
    static pointsToString(points: ShapePoint[]) {
        let output = "";
        for (const p of points) output += p.toString();
        return output;
    }

    /**
     * Converts an array of command-coordinate tuples into an array of ShapePoint objects.
     * @param array - An array of command-coordinate tuples, where the first element is the command string and the remaining elements are the coordinate values.
     * @returns An array of ShapePoint objects representing the input array.
     */
    static fromArray(array: VanillaPoint[]): ShapePoint[] {
        const points: ShapePoint[] = [];
        for (const point of array) {
            const command = point[0] as string;
            const coordinates = point.slice(1) as number[];
            const coordPairs: Coordinate[] = [];
            for (let i = 0; i < coordinates.length; i += 2) {
                if (i + 1 >= coordinates.length) {
                    console.warn(
                        `Warning: Incomplete coordinate pair for command ${command}`,
                    );
                    break;
                }
                coordPairs.push({ x: coordinates[i], y: coordinates[i + 1] });
            }

            points.push(new ShapePoint(this.checkCommand(command), coordPairs));
        }
        return points;
    }

    /**
     * Applies an offset to the coordinates of the ShapePoint in place.
     *
     * @param offset - An object containing the x and y offsets to apply.
     * @returns The modified ShapePoint object (which is the same object).
     */
    applyOffset(offset: Coordinate) {
        for (const point of this.coordinates) {
            point.x += offset.x;
            point.y += offset.y;
        }
        return this;
    }

    /**
     * Converts the ShapePoint into an array format with command as first element
     * @returns Tuple with command string followed by coordinate numbers
     */
    toArray(): VanillaPoint {
        return [
            this.command,
            ...this.coordinates.flatMap((coord) => [coord.x, coord.y]),
        ];
    }

    /**
     * Converts an array of ShapePoints into an array of command-coordinate tuples
     * @param points Array of ShapePoint objects to convert
     * @returns Array of tuples, each containing a command string and coordinates
     */
    static pointsToArray(points: ShapePoint[]): VanillaPoint[] {
        return points.map((point) => point.toArray());
    }

    /**
     * Creates an array of `ShapePoint` objects from an SVG path string.
     *
     * This method takes advantage of the fact that the `fabric.Path` class can parse SVG paths.
     *
     * @param svgPath - The SVG path string to parse.
     * @returns An array of `ShapePoint` objects representing the parsed path.
     */
    static fromString(svgPath: string): ShapePoint[] {
        // Take advantage of the fact that fabric.Path can parse SVG paths
        const tempPath = new fabric.Path(svgPath);
        const points = ShapePoint.fromArray(
            tempPath.path as any as VanillaPoint[],
        );
        return points;
    }

    /******************** GENERATORS *********************/
    static createShapePoint(
        command: SvgCommandEnum,
        coordinates: Coordinate[],
    ): ShapePoint {
        this.checkCoordinatesWithCommand(command, coordinates);
        return new ShapePoint(command, coordinates);
    }

    /**
     * Creates a Move command ShapePoint
     * @param x X coordinate to move to
     * @param y Y coordinate to move to
     * @returns New ShapePoint with "M" command
     */
    static Move(coordinate: Coordinate): ShapePoint {
        return new ShapePoint(SvgCommandEnum.MOVE, [coordinate]);
    }

    /**
     * Creates a Quadratic curve command ShapePoint
     * @param cx Control point X coordinate
     * @param cy Control point Y coordinate
     * @param x End point X coordinate
     * @param y End point Y coordinate
     * @returns New ShapePoint with "Q" command
     */
    static Quadratic(
        controlPoint: Coordinate,
        endPoint: Coordinate,
    ): ShapePoint {
        return new ShapePoint(SvgCommandEnum.QUADRATIC, [
            { x: controlPoint.x, y: controlPoint.y },
            { x: endPoint.x, y: endPoint.y },
        ]);
    }

    /**
     * Creates a Cubic Bézier curve command ShapePoint.
     * @param cx1 The X coordinate of the first control point.
     * @param cy1 The Y coordinate of the first control point.
     * @param cx2 The X coordinate of the second control point.
     * @param cy2 The Y coordinate of the second control point.
     * @param x The X coordinate of the end point.
     * @param y The Y coordinate of the end point.
     * @returns A new ShapePoint with the "C" command.
     */
    static Cubic(
        controlPoint1: Coordinate,
        controlPoint2: Coordinate,
        endPoint: Coordinate,
    ): ShapePoint {
        return new ShapePoint(SvgCommandEnum.CUBIC, [
            { x: controlPoint1.x, y: controlPoint1.y },
            { x: controlPoint2.x, y: controlPoint2.y },
            { x: endPoint.x, y: endPoint.y },
        ]);
    }

    /**
     * Creates a Line command ShapePoint.
     * @param x The X coordinate of the end point.
     * @param y The Y coordinate of the end point.
     * @returns A new ShapePoint with the "L" command.
     */
    static Line(endPoint: Coordinate): ShapePoint {
        return new ShapePoint(SvgCommandEnum.LINE, [endPoint]);
    }

    /**
     * Creates a ShapePoint with the "Z" command, which closes the current path by drawing a straight line from the current point to the start point of the path.
     * @returns A new ShapePoint with the "Z" command.
     */
    static Close(): ShapePoint {
        return new ShapePoint(SvgCommandEnum.CLOSE, []);
    }

    // /**
    //  * Creates an Arc command ShapePoint.
    //  * @param rx The radius of the ellipse in the X-axis.
    //  * @param ry The radius of the ellipse in the Y-axis.
    //  * @param x The X coordinate of the end point.
    //  * @param y The Y coordinate of the end point.
    //  * @returns A new ShapePoint with the "A" command.
    //  */
    // static Arch(rx: number, ry: number, x: number, y: number): ShapePoint {
    //     return new ShapePoint("A", [
    //         { x: rx, y: ry },

    //         { x, y },
    //     ]);
    // }
}
