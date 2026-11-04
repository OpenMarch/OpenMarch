import { useEffect } from "react";
import type { FieldDimming } from "@/field/three/fieldDimming";
import { useShapeHidden, useShapeToolStore } from "../tool/shapeToolStore";

/**
 * Fades everyone who isn't in the open shape to a faint dot, and hides the shape's own marchers'
 * dots once it's drawn: its spots are where they'll be, and with pathways on its start rings and
 * walks show where they come from (#417), for as long as it's open (08-shape-system-ux.md,
 * "Marcher styling"). A selected placed shape fades nobody: selecting one is frequent. A shape waiting out of
 * sight (#416, `useShapeHidden`) fades nobody either.
 */
export function useShapeFocus(dimming: FieldDimming): void {
    const away = useShapeHidden();
    const shapeMembers = useShapeToolStore((s) => s.tool?.marchers ?? null);
    // Once drawn, its spots show where they'll be: their dots now would be a second set (#417)
    const drawn = useShapeToolStore(
        (s) => s.tool !== null && s.tool.params !== null,
    );
    const members = away ? null : shapeMembers;
    useEffect(() => {
        dimming.setFocus(members ? new Set(members.map((m) => m.id)) : null, {
            hideMembers: drawn,
        });
    }, [dimming, members, drawn]);
    useEffect(() => () => dimming.setFocus(null), [dimming]);
}
