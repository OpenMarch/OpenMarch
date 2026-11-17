import { useItemDrawingStore } from "@/stores/ItemDrawingStore";
import {
    useFieldSelectToolStore,
    useShowsSelectTool,
} from "@/field/fieldSelectTool";
import tolgee from "@/global/singletons/Tolgee";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

export function useCursorActionHandlers() {
    const { ready } = useEditorReadiness();
    const showsSelectTool = useShowsSelectTool();
    const selectedMarchersContext = useSelectedMarchers();
    const setSelectedMarchers =
        selectedMarchersContext?.setSelectedMarchers ?? (() => {});

    // Not gated on `ready`: deselecting must work even while page data is loading
    useActionHandler("cancelAlignmentUpdates", () => {
        // Drawing a prop (C2.1): Escape turns the prop tool off, and nothing else
        const propTool = useItemDrawingStore.getState();
        if (propTool.drawingMode) {
            propTool.resetDrawingState();
            return;
        }
        // Deselect all marchers
        setSelectedMarchers([]);
    });

    useActionHandler(
        "selectAllMarchers",
        () => {
            // The field selects through its editor
            activeFieldEditor()?.selectAll();
        },
        { enabled: ready },
    );

    // Box to Lasso, or back, as the field's Select bar does. The palette names the tool it picks.
    // Not in the touch layout, which hides the bar: there the pill's drag modes pick
    useActionHandler(
        "toggleLassoSelect",
        () => useFieldSelectToolStore.getState().toggle(),
        {
            label: () =>
                useFieldSelectToolStore.getState().tool === "lasso"
                    ? tolgee.t("actions.select.useBox")
                    : tolgee.t("actions.select.useLasso"),
        },
        showsSelectTool,
    );
}
