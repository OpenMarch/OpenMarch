import { useEffect } from "react";
import type { FieldDimming } from "@/field/three/fieldDimming";
import { useShapeHidden, useShapeToolStore } from "../tool/shapeToolStore";

/**
 * Fades everyone who isn't in the open shape to a faint dot, and hides the shape's own marchers'
 * dots once it's drawn: its spots are where they'll be, and with pathways on its start rings and
 * walks show where they come from (#417), for as long as it's open (08-shape-system-ux.md,
 * "Marcher styling"). A selected placed shape fades nobody: selecting one is frequent. A shape waiting out of
 * sight (#416, `useShapeHidden`) fades nobody either.
 *
 * `follow` is the line the Follow tool is open on (pathways step 4d, `useFollowFocus`): with no
 * shape open, everyone else fades the same way and can't be picked. Its own marchers stay drawn:
 * the tool puts them where they're shown.
 */
export function useShapeFocus(
    dimming: FieldDimming,
    follow: readonly number[] | null = null,
): void {
    const away = useShapeHidden();
    const shapeMembers = useShapeToolStore((s) => s.tool?.marchers ?? null);
    // Once drawn, its spots show where they'll be: their dots now would be a second set (#417)
    const drawn = useShapeToolStore(
        (s) => s.tool !== null && s.tool.params !== null,
    );
    const members = away ? null : shapeMembers;
    useEffect(() => {
        if (members)
            dimming.setFocus(new Set(members.map((m) => m.id)), {
                hideMembers: drawn,
            });
        else dimming.setFocus(follow ? new Set(follow) : null);
    }, [dimming, members, drawn, follow]);
    useEffect(() => () => dimming.setFocus(null), [dimming]);
}
