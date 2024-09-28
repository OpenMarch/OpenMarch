import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import * as Interfaces from "../../global/Interfaces";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "../RegisteredActionButton";

export default function UiSettingsToolbar({
    className,
}: Interfaces.topBarComponentProps) {
    const { uiSettings } = useUiSettingsStore();

    return (
        <div
            className={`${className}`}
            title="Ui Settings Toolbar"
            aria-label="Ui Settings Toolbar"
        >
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.togglePreviousPagePaths
                }
                instructionalString={
                    uiSettings.previousPaths
                        ? RegisteredActionsObjects.togglePreviousPagePaths
                              .instructionalStringToggleOff
                        : RegisteredActionsObjects.togglePreviousPagePaths
                              .instructionalStringToggleOn
                }
                className={`${
                    uiSettings.previousPaths
                        ? "btn-primary"
                        : "btn-primary-appear-disabled"
                } rounded-none rounded-l`}
            >
                Prev Paths
            </RegisteredActionButton>
            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.toggleNextPagePaths}
                instructionalString={
                    uiSettings.nextPaths
                        ? RegisteredActionsObjects.toggleNextPagePaths
                              .instructionalStringToggleOff
                        : RegisteredActionsObjects.toggleNextPagePaths
                              .instructionalStringToggleOn
                }
                className={`${
                    uiSettings.nextPaths
                        ? "btn-primary"
                        : "btn-primary-appear-disabled"
                } rounded-none rounded-r`}
            >
                Next Paths
            </RegisteredActionButton>
        </div>
    );
}
