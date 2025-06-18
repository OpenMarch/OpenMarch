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
    CaretDownIcon,
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { clsx } from "clsx";
import * as Popover from "@radix-ui/react-popover";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import CoordinateRoundingSettings from "@/components/field/CoordinateRoundingSettings";

export default function AlignmentTab() {
    const { uiSettings } = useUiSettingsStore();
    return (
        <div className="flex w-full flex-wrap gap-8">
            <CoordinateRoundingPopover />
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
                    className={clsx(
                        "flex gap-6",
                        uiSettings.lockX ? "text-accent" : "text-text",
                    )}
                >
                    <ArrowsVerticalIcon size={24} />
                    Lock X
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
                    className={`flex gap-6 ${uiSettings.lockY ? "text-accent" : "text-text"}`}
                >
                    <ArrowsHorizontalIcon size={24} />
                    Lock Y
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.snapToNearestWhole
                    }
                    className={`flex gap-6`}
                >
                    <ArrowsInCardinalIcon size={24} />
                    Snap marcher
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
            <SetMarcherPositionsDropdown />
        </div>
    );
}

function CoordinateRoundingPopover() {
    const { uiSettings } = useUiSettingsStore();
    return (
        <ToolbarSection>
            <Popover.Root>
                <Popover.Trigger className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50">
                    Coordinate rounding
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content className="bg-modal text-text rounded-6 shadow-modal backdrop-blur-32 border-stroke m-8 flex flex-col items-start gap-0 border p-8">
                        <CoordinateRoundingSettings />
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
            <p className="text-text-subtitle">
                X: {uiSettings.coordinateRounding?.nearestXSteps}
            </p>
            <p className="text-text-subtitle">
                Y: {uiSettings.coordinateRounding?.nearestYSteps}
            </p>
        </ToolbarSection>
    );
}

function SetMarcherPositionsDropdown() {
    return (
        <ToolbarSection aria-label="Set marcher positions">
            <Dropdown.Root>
                <Dropdown.Trigger className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50">
                    Place all marchers... <CaretDownIcon size={18} />
                </Dropdown.Trigger>
                <Dropdown.Portal>
                    <Dropdown.Content className="bg-modal rounded-6 shadow-modal backdrop-blur-32 border-stroke flex flex-col items-start gap-0 border p-8">
                        <RegisteredActionButton
                            registeredAction={
                                RegisteredActionsObjects.setAllMarchersToPreviousPage
                            }
                            className="text-text px-6 py-4"
                        >
                            to previous page positions
                        </RegisteredActionButton>
                        <RegisteredActionButton
                            registeredAction={
                                RegisteredActionsObjects.setAllMarchersToNextPage
                            }
                            className="text-text px-6 py-4"
                        >
                            to next page positions
                        </RegisteredActionButton>
                    </Dropdown.Content>
                </Dropdown.Portal>
            </Dropdown.Root>

            <Dropdown.Root>
                <Dropdown.Trigger className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50">
                    Place selected marchers... <CaretDownIcon size={18} />
                </Dropdown.Trigger>
                <Dropdown.Portal>
                    <Dropdown.Content className="bg-modal rounded-6 shadow-modal backdrop-blur-32 border-stroke flex flex-col items-start gap-0 border p-8">
                        <RegisteredActionButton
                            registeredAction={
                                RegisteredActionsObjects.setSelectedMarchersToPreviousPage
                            }
                            className="text-text px-6 py-4"
                        >
                            to previous page positions
                        </RegisteredActionButton>
                        <RegisteredActionButton
                            registeredAction={
                                RegisteredActionsObjects.setSelectedMarchersToNextPage
                            }
                            className="text-text px-6 py-4"
                        >
                            to next page positions
                        </RegisteredActionButton>
                    </Dropdown.Content>
                </Dropdown.Portal>
            </Dropdown.Root>
        </ToolbarSection>
    );
}
