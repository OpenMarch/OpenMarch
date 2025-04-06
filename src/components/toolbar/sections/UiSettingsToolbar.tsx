import { uiSettingsSelector, useSettingsStore } from "@/stores/UiSettingsStore";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";

export default function UiSettingsToolbar() {
    const uiSettings = useSettingsStore(uiSettingsSelector);

    return (
        <ToolbarSection aria-label="Ui Settings Toolbar">
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.togglePreviousPagePaths
                }
                instructionalString={
                    uiSettings.showPreviousPaths
                        ? RegisteredActionsObjects.togglePreviousPagePaths
                              .instructionalStringToggleOff
                        : RegisteredActionsObjects.togglePreviousPagePaths
                              .instructionalStringToggleOn
                }
                className={`outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50 ${uiSettings.showPreviousPaths ? "text-accent" : "text-text"}`}
            >
                Prev paths
            </RegisteredActionButton>
            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.toggleNextPagePaths}
                instructionalString={
                    uiSettings.showNextPaths
                        ? RegisteredActionsObjects.toggleNextPagePaths
                              .instructionalStringToggleOff
                        : RegisteredActionsObjects.toggleNextPagePaths
                              .instructionalStringToggleOn
                }
                className={`outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50 ${uiSettings.showNextPaths ? "text-accent" : "text-text"}`}
            >
                Next paths
            </RegisteredActionButton>
        </ToolbarSection>
    );
}
