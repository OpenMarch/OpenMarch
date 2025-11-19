import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import {
    ArrowsHorizontalIcon,
    ArrowsVerticalIcon,
    ArrowsInCardinalIcon,
    CaretDownIcon,
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { clsx } from "clsx";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import CoordinateRoundingSettings from "@/components/field/CoordinateRoundingSettings";
import { T, useTolgee } from "@tolgee/react";
import ShapeTab from "./ShapeTab";

export default function AlignmentTab() {
    const { t } = useTolgee();
    const { uiSettings } = useUiSettingsStore();
    return (
        <div className="flex w-full flex-wrap gap-8">
            <CoordinateRoundingSettings />
            <ToolbarSection
                aria-label={t("toolbar.alignment.lockMarchersAriaLabel")}
            >
                <RegisteredActionButton
                    instructionalString={
                        uiSettings.lockX
                            ? RegisteredActionsObjects.lockX.getInstructionalStringToggleOff()
                            : RegisteredActionsObjects.lockX.getInstructionalStringToggleOn()
                    }
                    registeredAction={RegisteredActionsObjects.lockX}
                    className={clsx(
                        "flex gap-6",
                        uiSettings.lockX ? "text-accent" : "text-text",
                    )}
                >
                    <ArrowsVerticalIcon size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    instructionalString={
                        uiSettings.lockY
                            ? RegisteredActionsObjects.lockY.getInstructionalStringToggleOff()
                            : RegisteredActionsObjects.lockY.getInstructionalStringToggleOn()
                    }
                    registeredAction={RegisteredActionsObjects.lockY}
                    className={`flex gap-6 ${uiSettings.lockY ? "text-accent" : "text-text"}`}
                >
                    <ArrowsHorizontalIcon size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.snapToNearestWhole
                    }
                    className={`flex gap-6`}
                >
                    <ArrowsInCardinalIcon size={24} />
                </RegisteredActionButton>
                {/* -- */}
            </ToolbarSection>
            <SetMarcherPositionsDropdown />
            <ShapeTab />
        </div>
    );
}
function SetMarcherPositionsDropdown() {
    return (
        <ToolbarSection aria-label="Set marcher positions">
            <Dropdown.Root>
                <Dropdown.Trigger className="hover:text-accent flex items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50">
                    <T keyName="toolbar.alignment.placeAllMarchers" />{" "}
                    <CaretDownIcon size={18} />
                </Dropdown.Trigger>
                <Dropdown.Portal>
                    <Dropdown.Content className="bg-modal rounded-6 shadow-modal backdrop-blur-32 border-stroke flex flex-col items-start gap-0 border p-8">
                        <RegisteredActionButton
                            registeredAction={
                                RegisteredActionsObjects.setAllMarchersToPreviousPage
                            }
                            className="text-text px-6 py-4"
                            tooltipPosition="left"
                        >
                            <T keyName="toolbar.alignment.toPreviousPagePositions" />
                        </RegisteredActionButton>
                        <RegisteredActionButton
                            registeredAction={
                                RegisteredActionsObjects.setAllMarchersToNextPage
                            }
                            className="text-text px-6 py-4"
                            tooltipPosition="left"
                        >
                            <T keyName="toolbar.alignment.toNextPagePositions" />
                        </RegisteredActionButton>
                    </Dropdown.Content>
                </Dropdown.Portal>
            </Dropdown.Root>
        </ToolbarSection>
    );
}
