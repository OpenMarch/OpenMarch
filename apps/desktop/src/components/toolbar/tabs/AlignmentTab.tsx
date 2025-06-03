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
    RewindIcon,
    SkipBackIcon,
    PlayIcon,
    PauseIcon,
    SkipForwardIcon,
    FastForwardIcon,
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { topBarComponentProps } from "@/global/Interfaces";

export default function AlignmentTab() {
    const { uiSettings } = useUiSettingsStore();
    return (
        <div className="flex w-full flex-wrap gap-8">
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
                >
                    Set all to prev
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.setSelectedMarchersToPreviousPage
                    }
                >
                    Set selected to prev
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.setAllMarchersToNextPage
                    }
                >
                    Set all to next
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.setSelectedMarchersToNextPage
                    }
                >
                    Set selected to next
                </RegisteredActionButton>
            </ToolbarSection>
        </div>
    );
}
