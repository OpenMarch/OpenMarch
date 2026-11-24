import tolgee from "@/global/singletons/Tolgee";
import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
    planCanvasEdit,
    type CanvasEditPlan,
} from "@/timeline/timelineCoordinateWrites";
import {
    useActionHandler,
    useActionHandlerGroup,
} from "@/shortcuts/useActionHandler";
import { useEditorReadiness } from "@/shortcuts/handlers/useEditorReadiness";
import { currentShapeField, shapeContextFor } from "../field/shapeFieldContext";
import { placementOf, placesNothing, writePlacement } from "./shapePlacement";
import { kindPickGate, pickShapeKind } from "./pickKind";
import { SHAPE_TOOLS } from "./shapeTools";
import type { ToolState } from "./toolMachine";
import { useShapePaletteSource } from "../command/useShapePaletteSource";
import { GROUP_MIN, groupMarchers } from "../placed/groupMarchers";
import { useBoxSelectionStore } from "../placed/boxSelectionStore";
import {
    closeShapeTool,
    isShapeHidden,
    useShapeHidden,
    useShapeShown,
    useShapeToolStore,
} from "./shapeToolStore";

/**
 * The host's place function (spec #344): every open shape is placed through here, by Place
 * (Enter) and nothing else (#416). Its marchers go to their spots and its
 * recipe is saved as one edit (`writePlacement`, the same write a placed shape's edits use).
 * `plan` is the edit window to write to, the current one unless given. A placement that would
 * change nothing (`placesNothing`) writes nothing and costs no undo step. Resolves false when
 * nothing was placed.
 */
export async function placeShape(
    tool: ToolState,
    queryClient: QueryClient,
    plan: CanvasEditPlan | null = null,
    /**
     * Keep no shape (Shift+Enter, Shift-click on Place): the members go to their spots as a plain
     * move does and no recipe is saved, as Place then Ungroup would leave them
     */
    loose: boolean = false,
): Promise<boolean> {
    const field = currentShapeField();
    if (!field) return false;
    const found = placementOf(tool, shapeContextFor(field));
    if (!found) return false;
    const placement = loose ? { ...found, plain: true } : found;
    const edit = plan ?? planCanvasEdit();
    if (edit.ok && placesNothing(placement, edit.beat)) return true;
    return writePlacement(
        placement,
        queryClient,
        tolgee.t("shapes.tool.placeError", "Couldn't place the shape"),
        plan,
    );
}

/**
 * Place (Enter): places the open shape at the edit window now, then closes the tool. `loose`
 * (Shift+Enter) places the marchers and keeps no shape
 */
export function useApplyShape(): (loose?: boolean) => Promise<void> {
    const queryClient = useQueryClient();
    return useCallback(
        async (loose = false) => {
            const { tool } = useShapeToolStore.getState();
            if (!tool || isShapeHidden()) return;
            if (await placeShape(tool, queryClient, null, loose))
                closeShapeTool();
        },
        [queryClient],
    );
}

/**
 * Opens and places the shape tool from shortcuts, buttons and the command palette, and groups the
 * selection (#603)
 */
export function useShapeToolActions(): void {
    const { ready, selectedEditable } = useEditorReadiness();
    const placeable = useShapeToolStore(
        (s) => s.tool !== null && s.tool.params !== null && !s.tool.gesture,
    );
    const apply = useApplyShape();
    const hidden = useShapeHidden();
    const shown = useShapeShown();
    useShapePaletteSource(ready, selectedEditable, apply);

    // A kind's key arms it, or turns the open shape into it
    useActionHandlerGroup(
        SHAPE_TOOLS.map((entry) => entry.action),
        (id) => {
            const entry = SHAPE_TOOLS.find((e) => e.action === id);
            if (entry) pickShapeKind(entry.kind, selectedEditable);
        },
        { enabled: ready && kindPickGate(shown, selectedEditable).ok },
    );
    // Group the selected marchers and props as they stand (#603); not one placed shape selected whole,
    // which is a shape already (Ungroup is offered there instead)
    const shapeSelected = useBoxSelectionStore((s) => s.selected !== null);
    const queryClient = useQueryClient();
    useActionHandler(
        "shapeGroup",
        () =>
            void groupMarchers(
                selectedEditable.map((m) => m.id),
                queryClient,
            ),
        {
            enabled:
                ready &&
                !shown &&
                !shapeSelected &&
                selectedEditable.length >= GROUP_MIN,
            ignoreRepeat: true,
            // Too few to group says so; a shape open or selected offers its own commands
            disabledReason:
                ready && !shown && !shapeSelected
                    ? tolgee.t("shapes.placed.groupNeedsTwo")
                    : undefined,
        },
    );
    useActionHandler(
        "applyShape",
        () => {
            void apply();
        },
        // A shape waiting out of sight isn't placed by a key: Enter acts on what is shown (#416)
        { enabled: placeable && !hidden },
    );
    useActionHandler(
        "applyShapeLoose",
        () => {
            void apply(true);
        },
        { enabled: placeable && !hidden },
    );
}
