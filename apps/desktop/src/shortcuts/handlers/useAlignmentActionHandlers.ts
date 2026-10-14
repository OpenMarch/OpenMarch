import { toast } from "sonner";
import { useTolgee } from "@tolgee/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";
import { useUpdateCoordinates } from "./useUpdateCoordinates";

// eslint-disable-next-line max-lines-per-function
export function useAlignmentActionHandlers() {
    const { t } = useTolgee();
    const {
        fieldProperties,
        ready,
        getSelectedMarcherPages,
        selectedMarchers,
    } = useEditorReadiness();
    // Read when an action runs, so a settings change (such as a timeline zoom save) doesn't
    // re-render the handlers
    const setUiSettings = useUiSettingsStore((s) => s.setUiSettings);
    const hasSelection = ready && selectedMarchers.length > 0;
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
        { enabled: ready },
    );

    useActionHandler("lockX", () => {
        const { uiSettings } = useUiSettingsStore.getState();
        setUiSettings({ ...uiSettings, lockX: !uiSettings.lockX }, "lockX");
    });

    useActionHandler("lockY", () => {
        const { uiSettings } = useUiSettingsStore.getState();
        setUiSettings({ ...uiSettings, lockY: !uiSettings.lockY }, "lockY");
    });

    useActionHandler(
        "alignVertically",
        () => {
            const alignedCoords = CoordinateActions.alignVertically({
                marcherPages: getSelectedMarcherPages(),
            });
            updateCoordinates(alignedCoords);
        },
        { enabled: hasSelection },
    );

    useActionHandler(
        "alignHorizontally",
        () => {
            const alignedCoords = CoordinateActions.alignHorizontally({
                marcherPages: getSelectedMarcherPages(),
            });
            updateCoordinates(alignedCoords);
        },
        { enabled: hasSelection },
    );

    useActionHandler(
        "evenlyDistributeVertically",
        () => {
            if (!fieldProperties) return;
            const distributedCoords =
                CoordinateActions.evenlyDistributeVertically({
                    marcherPages: getSelectedMarcherPages(),
                    fieldProperties,
                });
            updateCoordinates(distributedCoords);
        },
        { enabled: hasSelection },
    );

    useActionHandler(
        "evenlyDistributeHorizontally",
        () => {
            if (!fieldProperties) return;
            const distributedCoords =
                CoordinateActions.evenlyDistributeHorizontally({
                    marcherPages: getSelectedMarcherPages(),
                    fieldProperties,
                });
            updateCoordinates(distributedCoords);
        },
        { enabled: hasSelection },
    );

    useActionHandler(
        "flipHorizontal",
        () => {
            const flippedCoords = CoordinateActions.flipHorizontal(
                getSelectedMarcherPages(),
            );
            updateCoordinates(flippedCoords);
        },
        { enabled: hasSelection },
    );

    useActionHandler(
        "flipVertical",
        () => {
            const flippedCoords = CoordinateActions.flipVertical(
                getSelectedMarcherPages(),
            );
            updateCoordinates(flippedCoords);
        },
        { enabled: hasSelection },
    );

    useActionHandler(
        "swapMarchers",
        () => {
            if (selectedMarchers.length !== 2) {
                console.error(
                    "Can only swap 2 marchers. Selected marchers:",
                    selectedMarchers,
                );
                toast.error(t("actions.swap.mustSelectTwo"));
                return;
            }
            // Each marcher takes the other's position where the selection edits
            const pair = getSelectedMarcherPages();
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
        { enabled: ready && selectedMarchers.length === 2 },
    );
}
