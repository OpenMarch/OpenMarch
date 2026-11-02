import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useShallow } from "zustand/react/shallow";
import {
    ArrowsHorizontalIcon,
    ArrowsVerticalIcon,
    ArrowsInCardinalIcon,
    CaretDownIcon,
    MagnetIcon,
} from "@phosphor-icons/react";
import ActionButton from "@/shortcuts/ActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import ClearPageMenuItems from "@/components/toolbar/ClearPageMenuItems";
import { clsx } from "clsx";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import CoordinateRoundingSettings from "@/components/field/CoordinateRoundingSettings";
import { T, useTolgee } from "@tolgee/react";
import { useState } from "react";

export default function AlignmentTab() {
    const { t } = useTolgee();
    const uiSettings = useUiSettingsStore(
        useShallow((s) => ({
            lockX: s.uiSettings.lockX,
            lockY: s.uiSettings.lockY,
            snap: s.uiSettings.snap,
        })),
    );
    return (
        <div className="flex w-full flex-wrap gap-8">
            <CoordinateRoundingSettings />
            <ToolbarSection
                aria-label={t("toolbar.alignment.lockMarchersAriaLabel")}
            >
                <ActionButton
                    toggleState={uiSettings.lockX ? "off" : "on"}
                    action="lockX"
                    caption={t("toolbar.alignment.lockXCaption")}
                    className={clsx(
                        "touch:min-h-44 flex items-center gap-6",
                        uiSettings.lockX ? "text-accent" : "text-text",
                    )}
                >
                    <ArrowsVerticalIcon size={24} />
                </ActionButton>
                <ActionButton
                    toggleState={uiSettings.lockY ? "off" : "on"}
                    action="lockY"
                    caption={t("toolbar.alignment.lockYCaption")}
                    className={`touch:min-h-44 flex items-center gap-6 ${uiSettings.lockY ? "text-accent" : "text-text"}`}
                >
                    <ArrowsHorizontalIcon size={24} />
                </ActionButton>
                {/* The Snap toggle (modifier roles, version A): pressed while snapping is off, as
                    on the floating editor, so a forgotten off state is in plain sight */}
                <ActionButton
                    toggleState={uiSettings.snap ? "off" : "on"}
                    action="toggleSnap"
                    caption={t("toolbar.alignment.snapToggleCaption")}
                    aria-pressed={!uiSettings.snap}
                    data-testid="toolbar-snap-toggle"
                    className={clsx(
                        "touch:min-h-44 flex items-center gap-6",
                        uiSettings.snap ? "text-text" : "text-accent",
                    )}
                >
                    <MagnetIcon size={24} />
                </ActionButton>
                <ActionButton
                    action="snapToNearestCustomFraction"
                    caption={t("toolbar.alignment.snapCaption")}
                    className="touch:min-h-44 flex items-center gap-6"
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
    const [open, setOpen] = useState(false);
    const close = () => setOpen(false);
    return (
        <ToolbarSection aria-label="Set marcher positions">
            <Dropdown.Root open={open} onOpenChange={setOpen}>
                <Dropdown.Trigger className="hover:text-accent touch:min-h-44 flex items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50">
                    <T keyName="toolbar.alignment.placeAllMarchers" />{" "}
                    <CaretDownIcon size={18} />
                </Dropdown.Trigger>
                <Dropdown.Portal>
                    <Dropdown.Content className="bg-modal rounded-6 shadow-modal backdrop-blur-32 border-stroke flex flex-col items-start gap-0 border p-8">
                        <ClearPageMenuItems
                            scope="all"
                            onRun={close}
                            className="text-text touch:min-h-44 px-6 py-4"
                        />
                        <ActionButton
                            action="setAllMarchersToNextPage"
                            onRun={close}
                            className="text-text touch:min-h-44 px-6 py-4"
                        >
                            <T keyName="toolbar.alignment.toNextPagePositions" />
                        </ActionButton>
                    </Dropdown.Content>
                </Dropdown.Portal>
            </Dropdown.Root>
        </ToolbarSection>
    );
}
