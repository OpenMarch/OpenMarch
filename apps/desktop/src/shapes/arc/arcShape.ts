import tolgee from "@/global/singletons/Tolgee";
import type { ShapeKind } from "../types";
import type { LineParams } from "../line/lineGeometry";
import { lineShape } from "../line/lineShape";
import { withBend } from "./arcGeometry";

/**
 * The Arc's shape kind, as recipes store it (#634): `arc`, version 2. Version 1 is the arc of the
 * old shapes panel (`kinds/arc.ts`), whose params these are not; an Arc's params are a Line's of
 * two points, the first bent ({@link isArcParams}), so it lays out its spots as the Line does.
 */
export const arcShape: ShapeKind<LineParams> = {
    ...lineShape,
    id: "arc",
    version: 2,
    get label() {
        return tolgee.t("shapes.kinds.arc.label", "Arc");
    },
    fit: (input, ctx) => withBend(lineShape.fit(input, ctx), 90),
};
