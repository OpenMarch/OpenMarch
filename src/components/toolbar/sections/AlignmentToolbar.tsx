import { useUiSettingsStore } from "@/stores/uiSettings/useUiSettingsStore";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import {
    ArrowsHorizontal,
    ArrowsVertical,
    ArrowsInCardinal,
    AlignCenterHorizontalSimple,
    AlignCenterVerticalSimple,
    AlignCenterVertical,
    AlignCenterHorizontal,
    DotsThreeOutline,
    DotsThreeOutlineVertical,
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";

export default function UiSettingsToolbar() {
    const { uiSettings } = useUiSettingsStore();

    return (
        <div className="flex gap-8">
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
                >
                    <ArrowsVertical size={24} />
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
                >
                    <ArrowsHorizontal size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.snapToNearestWhole
                    }
                >
                    <ArrowsInCardinal size={24} />
                </RegisteredActionButton>
                {/* -- */}
            </ToolbarSection>
            <ToolbarSection aria-label="Align marchers">
                <RegisteredActionButton
                    registeredAction={RegisteredActionsObjects.alignVertically}
                >
                    <AlignCenterVerticalSimple size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.alignHorizontally
                    }
                >
                    <AlignCenterHorizontalSimple size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.evenlyDistributeVertically
                    }
                >
                    <DotsThreeOutlineVertical size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.evenlyDistributeHorizontally
                    }
                >
                    <DotsThreeOutline size={24} />
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
            </ToolbarSection>
        </div>
    );
}
