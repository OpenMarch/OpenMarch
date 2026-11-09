import { useMemo } from "react";
import {
    useShowingShapeMarchers,
    withoutShapeMarchers,
} from "@/shapes/field/shapeOwnMarchers";
import OverlayLayer from "./layers/OverlayLayer";
import { useStartFlagOverlay } from "./useStartFlagOverlay";
import { useMarcherShapeOf } from "./useMarcherShapes";
import type { FieldMarchers } from "./fieldMarchers";

/**
 * The routes, then the dots on them, over the page's pathways (1.5) and under the labels and
 * marchers, so a marcher who hasn't left its start flag spot covers its dot.
 */
const START_FLAG_PATHS_ORDER = 1.6;
const START_FLAG_DOTS_ORDER = 1.7;

/**
 * Start flag positions on the field (fork #331): the routes, then the dots. Its own component, so
 * the window it follows (which moves on every scrub or beat step) re-renders only these two
 * layers, not the whole field.
 */
export default function StartFlagLayers({
    marchers,
    ...props
}: Omit<Parameters<typeof useStartFlagOverlay>[0], "shapeOf"> & {
    /** The drawn marchers, whose shapes the dots take */
    marchers: FieldMarchers;
}) {
    // An open shape's own marchers show its ghosts and walks instead (#417)
    const members = useShowingShapeMarchers();
    const marcherIds = useMemo(
        () => withoutShapeMarchers(props.marcherIds, members),
        [props.marcherIds, members],
    );
    const shapeOf = useMarcherShapeOf(marchers, props.fieldProperties?.theme);
    const plans = useStartFlagOverlay({ ...props, marcherIds, shapeOf });
    return (
        <>
            <OverlayLayer
                plan={plans?.paths ?? null}
                renderOrder={START_FLAG_PATHS_ORDER}
            />
            <OverlayLayer
                plan={plans?.dots ?? null}
                renderOrder={START_FLAG_DOTS_ORDER}
            />
        </>
    );
}
