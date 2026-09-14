import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTolgee } from "@tolgee/react";
import {
    swapMarchersMutationOptions,
    updateMarcherPagesMutationOptions,
} from "@/hooks/queries";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

// eslint-disable-next-line max-lines-per-function
export function useAlignmentActionHandlers() {
    const { t } = useTolgee();
    const queryClient = useQueryClient();
    const {
        selectedPage,
        fieldProperties,
        ready,
        getSelectedMarcherPages,
        selectedMarchers,
    } = useEditorReadiness();
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { mutate: swapMarchers } = useMutation(
        swapMarchersMutationOptions(queryClient),
    );
    const { mutate: updateMarcherPages } = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );

    useActionHandler(
        "snapToNearestCustomFraction",
        () => {
            if (!fieldProperties) return;
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
            updateMarcherPages(roundedCoords);
        },
        { enabled: ready },
    );

    useActionHandler("lockX", () => {
        setUiSettings({ ...uiSettings, lockX: !uiSettings.lockX }, "lockX");
    });

    useActionHandler("lockY", () => {
        setUiSettings({ ...uiSettings, lockY: !uiSettings.lockY }, "lockY");
    });

    useActionHandler(
        "alignVertically",
        () => {
            const alignedCoords = CoordinateActions.alignVertically({
                marcherPages: getSelectedMarcherPages(),
            });
            updateMarcherPages(alignedCoords);
        },
        { enabled: ready },
    );

    useActionHandler(
        "alignHorizontally",
        () => {
            const alignedCoords = CoordinateActions.alignHorizontally({
                marcherPages: getSelectedMarcherPages(),
            });
            updateMarcherPages(alignedCoords);
        },
        { enabled: ready },
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
            updateMarcherPages(distributedCoords);
        },
        { enabled: ready },
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
            updateMarcherPages(distributedCoords);
        },
        { enabled: ready },
    );

    useActionHandler(
        "flipHorizontal",
        () => {
            const flippedCoords = CoordinateActions.flipHorizontal(
                getSelectedMarcherPages(),
            );
            updateMarcherPages(flippedCoords);
        },
        { enabled: ready },
    );

    useActionHandler(
        "flipVertical",
        () => {
            const flippedCoords = CoordinateActions.flipVertical(
                getSelectedMarcherPages(),
            );
            updateMarcherPages(flippedCoords);
        },
        { enabled: ready },
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
            swapMarchers({
                pageId: selectedPage!.id,
                marcher1Id: selectedMarchers[0].id,
                marcher2Id: selectedMarchers[1].id,
            });
        },
        { enabled: ready },
    );
}
