import { IPath, IPathSegment, Point } from "./interfaces";
import { parseSvg } from "./SvgParser";

export class Path implements IPath {
    readonly segments: IPathSegment[];

    constructor(segments: IPathSegment[] = []) {
        this.segments = segments;
    }

    /**
     * Creates a Path instance from an SVG `d` attribute string.
     * @param d The SVG path data string.
     */
    public static fromSvgString(d: string): Path {
        const segments = parseSvg(d);
        return new Path(segments);
    }

    public getTotalLength(): number {
        return this.segments.reduce((sum, seg) => sum + seg.getLength(), 0);
    }

    public getPointAtLength(dist: number): Point {
        let remainingDistance = dist;

        for (const segment of this.segments) {
            const segmentLength = segment.getLength();
            if (remainingDistance <= segmentLength) {
                return segment.getPointAtLength(remainingDistance);
            }
            remainingDistance -= segmentLength;
        }

        // Return the end point if the distance is out of bounds
        const lastSegment = this.segments[this.segments.length - 1];
        return lastSegment ? lastSegment.endPoint : { x: 0, y: 0 };
    }

    public toSvgString(): string {
        if (this.segments.length === 0) {
            return "";
        }

        const moveto = `M ${this.segments[0].startPoint.x} ${this.segments[0].startPoint.y}`;
        const commands = this.segments.map((s) => s.toSvgCommand());

        return [moveto, ...commands].join(" ");
    }
}
