import tolgee from "@/global/singletons/Tolgee";
import type { ShapeKind } from "../types";
import {
    alongLine,
    isClosed,
    lineOutline,
    type LineParams,
} from "./lineGeometry";
import { lineFillSpots } from "./lineFill";

/**
 * The Line's shape kind, as recipes store it (#523): `line`, version 2. Version 1 is the path line
 * of the old shapes panel (two ends and a `Spacing`), whose params these are not; the Line's params
 * are its points (each with a tension), whether it's closed, and its spacing; a closed one also
 * how it's filled (#529).
 */
export const lineShape: ShapeKind<LineParams> = {
    id: "line",
    version: 2,
    get label() {
        return tolgee.t("shapes.kinds.line.label", "Line");
    },
    family: "path",
    defaultOrder: "nearest",
    groups: [],
    fit: () => ({
        points: [
            { x: 0, y: 0, tension: 0 },
            { x: 10, y: 0, tension: 0 },
        ],
        spacing: { mode: "fit" },
    }),
    // The tool's handles are the Line tool's own (`lineTool.ts`)
    handles: () => [],
    drag: (p) => p,
    outline: (p) => {
        const outline = lineOutline(p);
        return [isClosed(p) ? [...outline, outline[0]!] : outline];
    },
    generate: (p, n, ctx) => lineFillSpots(p, n, ctx.stepPx),
    /** From the first point along the line, the way the spots go */
    orderKey: (p, point) => [alongLine(p, point)],
};

/**
 * The Curve's shape kind (#525): the Line's, named Curve for the pickers. Its recipes are Line
 * recipes, so a placed curve reads back as a Line.
 */
export const curveShape: ShapeKind<LineParams> = {
    ...lineShape,
    get label() {
        return tolgee.t("shapes.kinds.curve.label", "Curve");
    },
};
