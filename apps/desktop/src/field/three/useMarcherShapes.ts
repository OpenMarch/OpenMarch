import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { FieldTheme } from "@openmarch/core";
import { resolveMarcherLook } from "@/entity-components/appearance";
import type { MarkerShape } from "../markerShape";
import type { FieldMarchers } from "./fieldMarchers";

/** Each marcher's shape by id, as drawn at the beat the field shows (`resolveMarcherLook`). */
export function marcherShapes(
    marchers: Pick<FieldMarchers, "ids" | "stacks">,
    theme: FieldTheme,
): ReadonlyMap<number, MarkerShape> {
    const shapes = new Map<number, MarkerShape>();
    marchers.ids.forEach((id, i) =>
        shapes.set(
            id,
            resolveMarcherLook(marchers.stacks[i] ?? [], theme).shape,
        ),
    );
    return shapes;
}

/**
 * A lookup of each marcher's shape as the field draws it now, for marks that stand for a marcher
 * away from its dot (`markerShape.ts`). A new function only when a shape changes, so plans keyed
 * on it aren't redone on every fill. Unknown marchers are circles.
 */
export function useMarcherShapeOf(
    marchers: FieldMarchers,
    theme: FieldTheme | undefined,
): (marcherId: number) => MarkerShape {
    const version = useSyncExternalStore(
        marchers.subscribe,
        () => marchers.appearanceVersion,
    );
    const shapes = useMemo(
        () => (theme ? marcherShapes(marchers, theme) : null),
        // Re-read when the looks change
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [marchers, theme, version],
    );
    // Keyed by what the shapes are, not which fill found them
    const key = shapes ? [...shapes].map(([id, s]) => `${id}:${s}`).join() : "";
    const latest = useMemo(() => shapes, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    return useCallback(
        (marcherId: number) => latest?.get(marcherId) ?? "circle",
        [latest],
    );
}
