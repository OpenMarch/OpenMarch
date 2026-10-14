import { lengthOf } from "../../sizes/units";
import type { TemplatePolicy } from "../policy";

/**
 * Stand-in values for tests only, distinct from the owner's figures in
 * `DEFAULT_TEMPLATE_POLICY` (../policy.ts), with a simple four-point outline
 * for every shaped cut.
 */
export const TEST_POLICY: TemplatePolicy = {
    safeArea: (surface) => {
        const inset =
            surface.unit === "mm" ? lengthOf(10, "mm") : lengthOf(1, "in");
        return { top: inset, right: inset, bottom: inset, left: inset };
    },
    bleed: () => lengthOf(0.25, "in"),
    cutOutline: (surface) => {
        const w = surface.width.m;
        const h = surface.height.m;
        return [
            [0, 0],
            [w, h * 0.25],
            [w, h * 0.75],
            [0, h],
        ];
    },
};
