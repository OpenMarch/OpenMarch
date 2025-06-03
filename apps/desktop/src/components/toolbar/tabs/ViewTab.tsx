import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";

export default function ViewTab() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <UiSettingsToolbar />
        </div>
    );
}

function UiSettingsToolbar() {
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
                className={`hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50 ${uiSettings.previousPaths ? "text-accent" : "text-text"}`}
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
                className={`hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50 ${uiSettings.nextPaths ? "text-accent" : "text-text"}`}
            >
                Next paths
            </RegisteredActionButton>
        </ToolbarSection>
    );
}
