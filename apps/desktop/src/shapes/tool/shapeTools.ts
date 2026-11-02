import type { ActionId } from "@/shortcuts/definitions";
import { boxTool } from "../box/boxTool";
import { circleTool } from "../circle/circleTool";
import { curveTool, lineTool } from "../line/lineTool";
import type { AnyToolKind } from "./toolKind";

/** A kind the shape pickers offer, with the action (and so the key) that picks it */
export interface ShapeToolEntry {
    readonly kind: AnyToolKind;
    readonly action: ActionId;
}

/**
 * Every kind that can be drawn, in the order the Shapes tab and the ring show them (#344). Adding
 * a kind is its module, an action and one line here.
 */
export const SHAPE_TOOLS: readonly ShapeToolEntry[] = [
    { kind: boxTool, action: "shapeBlock" },
    { kind: circleTool, action: "shapeCircle" },
    { kind: lineTool, action: "shapeLine" },
    { kind: curveTool, action: "shapeCurve" },
];
