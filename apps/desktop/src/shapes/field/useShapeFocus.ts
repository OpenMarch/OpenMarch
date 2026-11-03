import { useEffect } from "react";
import type { FieldDimming } from "@/field/three/fieldDimming";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useShapeHidden, useShapeToolStore } from "../tool/shapeToolStore";

/**
 * Fades everyone who isn't in the open shape to a faint dot, and hides the shape's own marchers'
 * dots once it's drawn: its spots are where they'll be, and with pathways on its start rings and
 * walks show where they come from (#417). As 08-shape-system-ux.md, "Marcher styling", has it: while
 * it's open, or with Settings › Field "Fade only while drawing", only while a drag draws it. A
 * selected placed shape fades nobody: selecting one is frequent. A shape waiting out of
 * sight (#416, `useShapeHidden`) fades nobody either.
 */
export function useShapeFocus(dimming: FieldDimming): void {
    const focus = useUiSettingsStore((s) => s.uiSettings.shapeFocus ?? "rest");
    const away = useShapeHidden();
    const shapeMembers = useShapeToolStore((s) => {
        const tool = s.tool;
        if (!tool) return null;
        const type = tool.gesture?.type;
        if (focus === "drawing" && type !== "draw" && type !== "points")
            return null;
        return tool.marchers;
    });
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
