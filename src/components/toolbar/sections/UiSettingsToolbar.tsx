import { useUiSettingsStore } from "@/stores/UiSettingsStore";
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
                className={`outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50 ${uiSettings.previousPaths ? "text-accent" : "text-text"}`}
            >
                Prev paths
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
                className={`outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50 ${uiSettings.previousPaths ? "text-accent" : "text-text"}`}
            >
                Next paths
            </RegisteredActionButton>
        </ToolbarSection>
    );
}
