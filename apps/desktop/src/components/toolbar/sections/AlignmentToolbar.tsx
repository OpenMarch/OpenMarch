import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import {
    ArrowsHorizontalIcon,
    ArrowsVerticalIcon,
    ArrowsInCardinalIcon,
    AlignCenterHorizontalSimpleIcon,
    AlignCenterVerticalSimpleIcon,
    DotsThreeOutlineIcon,
    DotsThreeOutlineVerticalIcon,
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";

export default function UiSettingsToolbar() {
    const { uiSettings } = useUiSettingsStore();

    return (
        <>
            <ToolbarSection aria-label="Cursor movement and marcher snap">
                <RegisteredActionButton
                    instructionalString={
                        uiSettings.lockX
                            ? RegisteredActionsObjects.lockX
                                  .instructionalStringToggleOff
                            : RegisteredActionsObjects.lockX
                                  .instructionalStringToggleOn
                    }
                    registeredAction={RegisteredActionsObjects.lockX}
                    className={uiSettings.lockX ? "text-accent" : "text-text"}
                >
                    <ArrowsVerticalIcon size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    instructionalString={
                        uiSettings.lockY
                            ? RegisteredActionsObjects.lockY
                                  .instructionalStringToggleOff
                            : RegisteredActionsObjects.lockY
                                  .instructionalStringToggleOn
                    }
                    registeredAction={RegisteredActionsObjects.lockY}
                    className={`rounded-none rounded-r ${
                        uiSettings.lockY ? "text-accent" : "text-text"
                    }`}
                >
                    <ArrowsHorizontalIcon size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.snapToNearestWhole
                    }
                >
                    <ArrowsInCardinalIcon size={24} />
                </RegisteredActionButton>
                {/* -- */}
            </ToolbarSection>
            <ToolbarSection aria-label="Align marchers">
                <RegisteredActionButton
                    registeredAction={RegisteredActionsObjects.alignVertically}
                >
                    <AlignCenterVerticalSimpleIcon size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.alignHorizontally
                    }
                >
                    <AlignCenterHorizontalSimpleIcon size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.evenlyDistributeVertically
                    }
                >
                    <DotsThreeOutlineVerticalIcon size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.evenlyDistributeHorizontally
                    }
                >
                    <DotsThreeOutlineIcon size={24} />
                </RegisteredActionButton>
            </ToolbarSection>
            <ToolbarSection aria-label="Set marcher positions">
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.setAllMarchersToPreviousPage
                    }
                    className="hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
                >
                    Set all to prev
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.setSelectedMarchersToPreviousPage
                    }
                    className="hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
                >
                    Set selected to prev
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.setAllMarchersToNextPage
                    }
                    className="hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
                >
                    Set all to next
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.setSelectedMarchersToNextPage
                    }
                    className="hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
                >
                    Set selected to next
                </RegisteredActionButton>
            </ToolbarSection>
        </>
    );
}
