import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    ArrowsHorizontalIcon,
    ArrowsVerticalIcon,
    ArrowsInCardinalIcon,
    CaretDownIcon,
} from "@phosphor-icons/react";
import ActionButton from "@/shortcuts/ActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { clsx } from "clsx";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import CoordinateRoundingSettings from "@/components/field/CoordinateRoundingSettings";
import { T, useTolgee } from "@tolgee/react";

export default function AlignmentTab() {
    const { t } = useTolgee();
    const { uiSettings } = useUiSettingsStore();
    return (
        <div className="flex w-full flex-wrap gap-8">
            <CoordinateRoundingSettings />
            <ToolbarSection
                aria-label={t("toolbar.alignment.lockMarchersAriaLabel")}
            >
                <ActionButton
                    toggleState={uiSettings.lockX ? "off" : "on"}
                    action="lockX"
                    className={clsx(
                        "flex gap-6",
                        uiSettings.lockX ? "text-accent" : "text-text",
                    )}
                >
                    <ArrowsVerticalIcon size={24} />
                </ActionButton>
                <ActionButton
                    toggleState={uiSettings.lockY ? "off" : "on"}
                    action="lockY"
                    className={`flex gap-6 ${uiSettings.lockY ? "text-accent" : "text-text"}`}
                >
                    <ArrowsHorizontalIcon size={24} />
                </ActionButton>
                <ActionButton
                    action="snapToNearestCustomFraction"
                    className={`flex gap-6`}
                >
                    <ArrowsInCardinalIcon size={24} />
                </ActionButton>
                {/* -- */}
            </ToolbarSection>
            <SetMarcherPositionsDropdown />
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
                        <ActionButton
                            action="setAllMarchersToPreviousPage"
                            className="text-text px-6 py-4"
                        >
                            <T keyName="toolbar.alignment.toPreviousPagePositions" />
                        </ActionButton>
                        <ActionButton
                            action="setAllMarchersToNextPage"
                            className="text-text px-6 py-4"
                        >
                            <T keyName="toolbar.alignment.toNextPagePositions" />
                        </ActionButton>
                    </Dropdown.Content>
                </Dropdown.Portal>
            </Dropdown.Root>
        </ToolbarSection>
    );
}
