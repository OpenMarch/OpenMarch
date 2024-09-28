import { useUiSettingsStore } from "@/stores/uiSettings/useUiSettingsStore";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";

export default function UiSettingsToolbar() {
    const { uiSettings } = useUiSettingsStore();

    return (
        <ToolbarSection aria-label="Ui Settings Toolbar">
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
                className={`${uiSettings.previousPaths ? "btn-primary" : "btn-primary-appear-disabled"} rounded-none rounded-l`}
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
                className={`${uiSettings.nextPaths ? "btn-primary" : "btn-primary-appear-disabled"} rounded-none rounded-r`}
            >
                Next Paths
            </RegisteredActionButton>
        </ToolbarSection>
    );
}
