import { IPath } from "./interfaces";

/**
 * Represents a collection of paths that may be intertwined or
 * part of a larger, more complex shape.
 */
export class PathGroup {
    readonly paths: IPath[];

    constructor(paths: IPath[] = []) {
        this.paths = paths;
    }

    /**
     * Returns a single SVG path `d` string containing all paths in the group.
     */
    public toSvgString(): string {
        return this.paths.map((p) => p.toSvgString()).join(" ");
    }
}
