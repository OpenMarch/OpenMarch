import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useShallow } from "zustand/react/shallow";
import {
    ArrowsHorizontalIcon,
    ArrowsVerticalIcon,
    ArrowsInCardinalIcon,
    MagnetIcon,
} from "@phosphor-icons/react";
import ActionButton from "@/shortcuts/ActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import MarcherPositionsMenu from "@/components/toolbar/MarcherPositionsMenu";
import { clsx } from "clsx";
import CoordinateRoundingSettings from "@/components/field/CoordinateRoundingSettings";
import { useTranslate } from "@tolgee/react";

export default function AlignmentTab() {
    const { t } = useTranslate();
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
                    className={`touch:min-h-44 flex items-center gap-6 ${uiSettings.lockY ? "text-accent" : "text-text"}`}
                >
                    <ArrowsHorizontalIcon size={24} />
                </ActionButton>
                {/* The Snap toggle (modifier roles, version A): pressed while snapping is off, as
                    on the floating editor, so a forgotten off state is in plain sight */}
                <ActionButton
                    toggleState={uiSettings.snap ? "off" : "on"}
                    action="toggleSnap"
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
    const { t } = useTranslate();
    return (
        <ToolbarSection
            aria-label={t("toolbar.alignment.setMarcherPositionsAriaLabel")}
        >
            <MarcherPositionsMenu
                scope="all"
                caretSize={18}
                triggerClassName="hover:text-accent touch:min-h-44 flex items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
            />
        </ToolbarSection>
    );
}
