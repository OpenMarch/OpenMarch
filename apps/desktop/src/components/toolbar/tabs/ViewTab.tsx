import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";

export default function ViewTab() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <UiSettingsToolbar />
        </div>
    );
}

function UiSettingsToolbar() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    return (
        <>
            <ToolbarSection aria-label="Ui Settings Toolbar">
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.togglePreviousPagePaths
                    }
                    instructionalString={
                        uiSettings.previousPaths
                            ? RegisteredActionsObjects.togglePreviousPagePaths.getInstructionalStringToggleOff()
                            : RegisteredActionsObjects.togglePreviousPagePaths.getInstructionalStringToggleOn()
                    }
                    className={`hover:text-accent flex gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50`}
                >
                    Prev paths
                    {uiSettings.previousPaths ? (
                        <EyeIcon className="text-accent" size={24} />
                    ) : (
                        <EyeSlashIcon size={24} />
                    )}
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.toggleNextPagePaths
                    }
                    instructionalString={
                        uiSettings.nextPaths
                            ? RegisteredActionsObjects.toggleNextPagePaths.getInstructionalStringToggleOff()
                            : RegisteredActionsObjects.toggleNextPagePaths.getInstructionalStringToggleOn()
                    }
                    className={`hover:text-accent flex gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50`}
                >
                    Next paths
                    {uiSettings.nextPaths ? (
                        <EyeIcon className="text-accent" size={24} />
                    ) : (
                        <EyeSlashIcon size={24} />
                    )}
                </RegisteredActionButton>
            </ToolbarSection>
            <ToolbarSection>
                <button
                    onClick={() => {
                        setUiSettings({
                            ...uiSettings,
                            gridLines: !uiSettings.gridLines,
                        });
                    }}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    Grid lines
                    {uiSettings.gridLines ? (
                        <EyeIcon className="text-accent" size={24} />
                    ) : (
                        <EyeSlashIcon size={24} />
                    )}
                </button>
                <button
                    onClick={() => {
                        setUiSettings({
                            ...uiSettings,
                            halfLines: !uiSettings.halfLines,
                        });
                    }}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    Half lines
                    {uiSettings.halfLines ? (
                        <EyeIcon className="text-accent" size={24} />
                    ) : (
                        <EyeSlashIcon size={24} />
                    )}
                </button>
            </ToolbarSection>
        </>
    );
}
