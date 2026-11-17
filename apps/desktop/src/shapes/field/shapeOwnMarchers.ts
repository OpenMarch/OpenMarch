import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
    ownLinesDrawn,
    pathMarcherIds,
    usePathPenStore,
} from "@/pathways/pathPenStore";
import { useShapeHidden, useShapeToolStore } from "../tool/shapeToolStore";

/**
 * While a shape is open and showing, its own marchers' start flag positions (the previous paths,
 * #331) give way to the shape's ghosts and walks, which are their "where from" (#417): the old
 * routes lead to spots the shape replaces, and their dots would stack on the ghosts. Everyone
 * else keeps theirs. The stored setting doesn't change; placing or dismissing brings them back.
 */
export function withoutShapeMarchers(
    ids: readonly number[] | undefined,
    members: ReadonlySet<number> | null,
): readonly number[] | undefined {
    if (!ids || !members) return ids;
    return ids.filter((id) => !members.has(id));
}

/**
 * The open shape's marchers while it shows, and the path pen's marchers while the field draws their
 * path (pathways), or null
 */
export function useShowingShapeMarchers(): ReadonlySet<number> | null {
    const marchers = useShapeToolStore((s) => s.tool?.marchers ?? null);
    const hidden = useShapeHidden();
    const onPath = usePathPenStore(
        useShallow((s) =>
            pathMarcherIds(
                s.session,
                s.hidden,
                marchers !== null,
                s.objects,
                s.ownable,
                ownLinesDrawn(
                    s.ownLines,
                    s.session,
                    s.hidden,
                    marchers !== null,
                ),
            ),
        ),
    );
    return useMemo(() => {
        const ids = [
            ...(marchers && !hidden ? marchers.map((m) => m.id) : []),
            ...onPath,
        ];
        return ids.length > 0 ? new Set(ids) : null;
    }, [marchers, hidden, onPath]);
}
