import { useAlignmentActionHandlers } from "./handlers/useAlignmentActionHandlers";
import { useAppActionHandlers } from "./handlers/useAppActionHandlers";
import { useBatchEditActionHandlers } from "./handlers/useBatchEditActionHandlers";
import { useCursorActionHandlers } from "./handlers/useCursorActionHandlers";
import { useFileActionHandlers } from "./handlers/useFileActionHandlers";
import { useHistoryActionHandlers } from "./handlers/useHistoryActionHandlers";
import { useNavigationActionHandlers } from "./handlers/useNavigationActionHandlers";
import { useNudgeActionHandlers } from "./handlers/useNudgeActionHandlers";
import { useTimelineActionEffects } from "./handlers/useTimelineActionEffects";
import { useUiActionHandlers } from "./handlers/useUiActionHandlers";
import { useShapeToolActions } from "@/shapes/tool/useShapeToolActions";
import { DiscardedShapeKeys, ShapeToolKeys } from "@/shapes/tool/ShapeToolKeys";
import {
    useShapeHidden,
    useShapeToolStore,
} from "@/shapes/tool/shapeToolStore";
import { PlacedBoxKeys } from "@/shapes/placed/PlacedBoxKeys";
import { useBoxSelectionStore } from "@/shapes/placed/boxSelectionStore";
import { useUnsetActionHandlers } from "./handlers/useUnsetActionHandlers";
import { useHoldActionHandlers } from "./handlers/useHoldActionHandlers";
import { useFieldEditActionHandlers } from "./handlers/useFieldEditActionHandlers";
import {
    useFieldEditModeEntry,
    useFieldLineActions,
    useFieldPanelActions,
} from "@/field/editMode/useFieldEditModeActions";
import { useFieldEditModeStore } from "@/field/editMode/fieldEditModeStore";

/** Handlers available before a show is open (launch page). */
export function FileActionHandlers() {
    useFileActionHandlers();
    return null;
}

/** Handlers that need an open show and editor contexts. */
export function EditorActionHandlers() {
    useAppActionHandlers();
    useHistoryActionHandlers();
    useNavigationActionHandlers();
    useBatchEditActionHandlers();
    useNudgeActionHandlers();
    useAlignmentActionHandlers();
    useUiActionHandlers();
    useCursorActionHandlers();
    useShapeToolActions();
    useUnsetActionHandlers();
    useHoldActionHandlers();
    useFieldEditActionHandlers();
    useFieldEditModeEntry();
    useTimelineActionEffects();
    // Mounted after the handlers above, so the open shape tool's keys are on top, and a selected
    // placed box's below them
    // An open shape waiting out of sight (#416) takes no keys: Escape, undo and the arrows act on
    // what is shown
    const shapeToolOpen = useShapeToolStore((s) => s.tool !== null);
    const shapeHidden = useShapeHidden();
    const boxSelected = useBoxSelectionStore(
        (s) => s.selected !== null || s.inside !== null,
    );
    const shapeDiscarded = useShapeToolStore((s) => s.discarded !== null);
    // The Field panel (#824) takes its keys over everything while it's open
    const fieldPanelOpen = useFieldEditModeStore((s) => s.active);
    if (fieldPanelOpen) return <FieldPanelKeys />;
    if (shapeToolOpen && !shapeHidden) return <ShapeToolKeys />;
    return (
        <>
            {boxSelected && <PlacedBoxKeys />}
            {/* Undo right after Escape brings the shape back, over a placed box's keys too */}
            {shapeDiscarded && <DiscardedShapeKeys />}
        </>
    );
}

/** The Field panel's keys while it's open, and Edit lines' while that's on (#824) */
function FieldPanelKeys() {
    useFieldPanelActions();
    const editingLines = useFieldEditModeStore((s) => s.lines);
    return editingLines ? <FieldLineKeys /> : null;
}

function FieldLineKeys(): null {
    useFieldLineActions();
    return null;
}
