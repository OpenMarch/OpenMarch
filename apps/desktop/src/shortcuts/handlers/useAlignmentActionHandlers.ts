import { useTranslate } from "@tolgee/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import { anchorPoint } from "@/field/editor/selectionPivot";
import { boundsOf } from "@/field/editor/groupTransform";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";
import { useUpdateCoordinates } from "./useUpdateCoordinates";

/**
 * What Flip mirrors the marchers at `pages` about: the selection's pivot when it was moved off the
 * center (the Arrange section's pivot grid, or dragged onto a marcher or a spot), worked out from
 * the positions being flipped; undefined for their own center. A marcher outside the selection
 * stays where the field draws it.
 */
function pivotOf(
    pages: readonly { marcher_id: number; x: number; y: number }[],
): { x: number; y: number } | undefined {
    const editor = activeFieldEditor();
    const anchor = editor?.selectionPivotAnchor();
    const box = boundsOf(pages);
    if (!editor || !anchor || !box) return undefined;
    const byId = new Map(pages.map((p) => [p.marcher_id, p]));
    return anchorPoint(
        anchor,
        box,
        (id) => byId.get(id) ?? editor.selectionPivot()?.at,
    );
}

/**
 * What Flip mirrors the marchers at `pages` about (`pivotOf`). A pivot set on a cell of the box is
 * pinned to that spot on the field first, so it stays put: flipping again, or undoing, goes about
 * the same line rather than the far edge of the flipped box.
 */
function flipPivot(
    pages: readonly { marcher_id: number; x: number; y: number }[],
): { x: number; y: number } | undefined {
    const around = pivotOf(pages);
    const editor = activeFieldEditor();
    if (around && editor?.selectionPivotAnchor()?.kind === "box")
        editor.pinSelectionPivot(around);
    return around;
}

// eslint-disable-next-line max-lines-per-function
export function useAlignmentActionHandlers() {
    const { t } = useTranslate();
    const {
        fieldProperties,
        ready,
        getSelectedMarcherPages,
        getSelectedEditablePages,
        selectedMarchers,
        selectedEditable,
    } = useEditorReadiness();
    // Read when an action runs, so a settings change (such as a timeline zoom save) doesn't
    // re-render the handlers
    const setUiSettings = useUiSettingsStore((s) => s.setUiSettings);
    const hasSelection = ready && selectedMarchers.length > 0;
    // Align, distribute and swap line up marchers and props alike; a locked item stays put
    const hasEditable = ready && selectedEditable.length > 0;
    // Why they're greyed out: nothing selected, or only locked items
    const noSelection = ready
        ? t("actions.shape.noMarchersSelected")
        : undefined;
    const noEditable =
        ready && selectedMarchers.length > 0
            ? t("actions.alignment.lockedOnly")
            : noSelection;
    const forEditable = {
        enabled: hasEditable,
        disabledReason: noEditable,
    };
    const forSelection = { enabled: hasSelection, disabledReason: noSelection };
    const updateCoordinates = useUpdateCoordinates();

    useActionHandler(
        "snapToNearestCustomFraction",
        () => {
            if (!fieldProperties) return;
            const { uiSettings } = useUiSettingsStore.getState();
            const safeDenominatorX =
                uiSettings.coordinateRounding?.nearestXSteps === 0 ||
                uiSettings.coordinateRounding?.nearestXSteps === undefined
                    ? 0
                    : 1 / uiSettings.coordinateRounding?.nearestXSteps;
            const safeDenominatorY =
                uiSettings.coordinateRounding?.nearestYSteps === 0 ||
                uiSettings.coordinateRounding?.nearestYSteps === undefined
                    ? 0
                    : 1 / uiSettings.coordinateRounding?.nearestYSteps;
            const roundedCoords = CoordinateActions.getRoundCoordinates({
                marcherPages: getSelectedMarcherPages(),
                fieldProperties: fieldProperties,
                denominatorX: safeDenominatorX,
                denominatorY: safeDenominatorY,
                xAxis: !uiSettings.lockX,
                yAxis: !uiSettings.lockY,
            });
            updateCoordinates(roundedCoords);
        },
        // Nothing selected, nothing to round: greyed out, saying so, not a click that does nothing
        forSelection,
    );

    useActionHandler("lockX", () => {
        const { uiSettings } = useUiSettingsStore.getState();
        setUiSettings({ ...uiSettings, lockX: !uiSettings.lockX }, "lockX");
    });

    useActionHandler("lockY", () => {
        const { uiSettings } = useUiSettingsStore.getState();
        setUiSettings({ ...uiSettings, lockY: !uiSettings.lockY }, "lockY");
    });

    useActionHandler("toggleSnap", () =>
        useUiSettingsStore.getState().setSnap(),
    );

    useActionHandler(
        "alignVertically",
        () => {
            const alignedCoords = CoordinateActions.alignVertically({
                marcherPages: getSelectedEditablePages(),
            });
            updateCoordinates(alignedCoords);
        },
        forEditable,
    );

    useActionHandler(
        "alignHorizontally",
        () => {
            const alignedCoords = CoordinateActions.alignHorizontally({
                marcherPages: getSelectedEditablePages(),
            });
            updateCoordinates(alignedCoords);
        },
        forEditable,
    );

    useActionHandler(
        "evenlyDistributeVertically",
        () => {
            if (!fieldProperties) return;
            const distributedCoords =
                CoordinateActions.evenlyDistributeVertically({
                    marcherPages: getSelectedEditablePages(),
                    fieldProperties,
                });
            updateCoordinates(distributedCoords);
        },
        forEditable,
    );

    useActionHandler(
        "evenlyDistributeHorizontally",
        () => {
            if (!fieldProperties) return;
            const distributedCoords =
                CoordinateActions.evenlyDistributeHorizontally({
                    marcherPages: getSelectedEditablePages(),
                    fieldProperties,
                });
            updateCoordinates(distributedCoords);
        },
        forEditable,
    );

    useActionHandler(
        "flipHorizontal",
        () => {
            const pages = getSelectedMarcherPages();
            const flippedCoords = CoordinateActions.flipHorizontal(
                pages,
                flipPivot(pages),
            );
            updateCoordinates(flippedCoords);
        },
        forSelection,
    );

    useActionHandler(
        "flipVertical",
        () => {
            const pages = getSelectedMarcherPages();
            const flippedCoords = CoordinateActions.flipVertical(
                pages,
                flipPivot(pages),
            );
            updateCoordinates(flippedCoords);
        },
        forSelection,
    );

    useActionHandler(
        "swapMarchers",
        () => {
            // Greyed out otherwise, saying why
            if (selectedEditable.length !== 2) return;
            // Each marcher takes the other's position where the selection edits
            const pair = getSelectedEditablePages();
            if (pair.length !== 2) {
                // Refused by the selection: say why, as the other tools do
                updateCoordinates([]);
                return;
            }
            updateCoordinates([
                { ...pair[0], x: pair[1].x, y: pair[1].y },
                { ...pair[1], x: pair[0].x, y: pair[0].y },
            ]);
        },
        {
            enabled: ready && selectedEditable.length === 2,
            disabledReason: ready ? t("actions.swap.selectTwo") : undefined,
        },
    );
}
