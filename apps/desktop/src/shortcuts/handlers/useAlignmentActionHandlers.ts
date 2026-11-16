import { useTranslate } from "@tolgee/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";
import { useUpdateCoordinates } from "./useUpdateCoordinates";

// eslint-disable-next-line max-lines-per-function
export function useAlignmentActionHandlers() {
    const { t } = useTranslate();
    const {
        fieldProperties,
        ready,
        getSelectedMarcherPages,
        getSelectedPerformerPages,
        selectedMarchers,
        selectedPerformers,
    } = useEditorReadiness();
    // Read when an action runs, so a settings change (such as a timeline zoom save) doesn't
    // re-render the handlers
    const setUiSettings = useUiSettingsStore((s) => s.setUiSettings);
    const hasSelection = ready && selectedMarchers.length > 0;
    // Align, distribute and swap line performers up: a selected prop isn't one more dot (C2.2)
    const hasPerformers = ready && selectedPerformers.length > 0;
    // Why they're greyed out: nothing selected, or only props (which don't line up)
    const noSelection = ready
        ? t("actions.shape.noMarchersSelected")
        : undefined;
    const noPerformers =
        ready && selectedMarchers.length > 0
            ? t("actions.alignment.propsOnly")
            : noSelection;
    const forPerformers = {
        enabled: hasPerformers,
        disabledReason: noPerformers,
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
                marcherPages: getSelectedPerformerPages(),
            });
            updateCoordinates(alignedCoords);
        },
        forPerformers,
    );

    useActionHandler(
        "alignHorizontally",
        () => {
            const alignedCoords = CoordinateActions.alignHorizontally({
                marcherPages: getSelectedPerformerPages(),
            });
            updateCoordinates(alignedCoords);
        },
        forPerformers,
    );

    useActionHandler(
        "evenlyDistributeVertically",
        () => {
            if (!fieldProperties) return;
            const distributedCoords =
                CoordinateActions.evenlyDistributeVertically({
                    marcherPages: getSelectedPerformerPages(),
                    fieldProperties,
                });
            updateCoordinates(distributedCoords);
        },
        forPerformers,
    );

    useActionHandler(
        "evenlyDistributeHorizontally",
        () => {
            if (!fieldProperties) return;
            const distributedCoords =
                CoordinateActions.evenlyDistributeHorizontally({
                    marcherPages: getSelectedPerformerPages(),
                    fieldProperties,
                });
            updateCoordinates(distributedCoords);
        },
        forPerformers,
    );

    useActionHandler(
        "flipHorizontal",
        () => {
            const flippedCoords = CoordinateActions.flipHorizontal(
                getSelectedMarcherPages(),
            );
            updateCoordinates(flippedCoords);
        },
        forSelection,
    );

    useActionHandler(
        "flipVertical",
        () => {
            const flippedCoords = CoordinateActions.flipVertical(
                getSelectedMarcherPages(),
            );
            updateCoordinates(flippedCoords);
        },
        forSelection,
    );

    useActionHandler(
        "swapMarchers",
        () => {
            // Greyed out otherwise, saying why
            if (selectedPerformers.length !== 2) return;
            // Each marcher takes the other's position where the selection edits
            const pair = getSelectedPerformerPages();
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
            enabled: ready && selectedPerformers.length === 2,
            disabledReason: ready ? t("actions.swap.selectTwo") : undefined,
        },
    );
}
