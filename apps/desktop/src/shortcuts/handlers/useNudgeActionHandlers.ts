import { useRef } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import { useUpdateSelectedMarchersOnSelectedPage } from "@/hooks/queries";
import { NUDGE_ACTION_IDS, type NudgeArgs } from "../definitions";
import { resolveNudgeDistance } from "../nudge";
import { useActionHandlerGroup } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

export function useNudgeActionHandlers() {
    const { ready, fieldProperties, getSelectedMarcherPages } =
        useEditorReadiness();
    const coordinateRounding = useUiSettingsStore(
        (s) => s.uiSettings.coordinateRounding,
    );
    const { mutateAsync: updateSelectedMarchersAsync } =
        useUpdateSelectedMarchersOnSelectedPage();
    const isUpdating = useRef(false);

    useActionHandlerGroup(
        NUDGE_ACTION_IDS,
        (_id, args) => {
            if (isUpdating.current || !fieldProperties) return;
            const nudge = args as unknown as NudgeArgs;
            const distance = resolveNudgeDistance(nudge, coordinateRounding);
            isUpdating.current = true;
            const updatedPagesArray = CoordinateActions.moveMarchersXY({
                marcherPages: getSelectedMarcherPages(),
                direction: nudge.direction,
                distance,
                snap: nudge.snap,
                fieldProperties,
                snapDenominatorX: 1.0 / distance,
                snapDenominatorY: 1.0 / distance,
            });
            updateSelectedMarchersAsync(() => updatedPagesArray).finally(() => {
                isUpdating.current = false;
            });
        },
        { enabled: ready },
    );
}
