import { useTranslate } from "@tolgee/react";
import {
    getButtonClassName,
    TabContent,
    TabItem,
    Tabs,
    TabsList,
} from "@openmarch/ui";
import { XIcon } from "@phosphor-icons/react";
import ActionButton from "@/shortcuts/ActionButton";
import {
    fieldEditMode,
    useFieldEditModeStore,
    type FieldPanelTab,
} from "./fieldEditModeStore";
import { useFieldProperties } from "./useApplyFieldEdits";
import { AppearanceTab, SetupTab } from "./panel/FieldSettings";
import { LinesTab } from "./panel/LinesTab";

export { FIELD_EDIT_PANEL_ID } from "./fieldEditPanelId";

const TABS: readonly FieldPanelTab[] = ["setup", "lines", "appearance"];

/**
 * The Field panel (#824), opened from the sidebar's Field button like the Marchers and Metronome
 * panels, with their header: Done (keep the changes) and X (put the field back as it was when
 * the panel opened). Its tabs: Setup (the template, size and names), Lines (the list, and Edit
 * lines, the one mode that edits the field on the canvas) and Appearance (markings, the image
 * and colors). It opens on Setup with the field shown whole beside it.
 */
export function FieldEditPanel() {
    const { t } = useTranslate();
    const fp = useFieldProperties();
    const tab = useFieldEditModeStore((s) => s.tab);

    return (
        <div
            className="animate-scale-in text-text flex h-full w-fit min-w-0 flex-col gap-16"
            data-testid="field-edit-panel"
            data-field-edit-pane="panel"
            role="region"
            aria-label={t("fieldEditMode.panel.title")}
        >
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">
                    {t("fieldEditMode.panel.title")}
                </h4>
                <div className="flex items-center gap-8">
                    <ActionButton
                        action="fieldEditDone"
                        data-testid="field-edit-done"
                        // The size is on the label: ActionButton's twMerge reads `text-body` as a
                        // color and would drop the primary's `text-text-invert` for it
                        className={`${getButtonClassName({ variant: "primary", size: "compact" })} enabled:hover:text-text-invert`}
                    >
                        <span className="text-body">
                            {t("fieldEditMode.panel.done")}
                        </span>
                    </ActionButton>
                    <ActionButton
                        action="fieldEditDiscard"
                        data-testid="field-edit-discard"
                        aria-label={t("fieldEditMode.panel.discard")}
                        tooltip={t("fieldEditMode.panel.discardTip")}
                        className="hover:text-red touch:size-44 flex items-center justify-center duration-150 ease-out"
                    >
                        <XIcon size={24} />
                    </ActionButton>
                </div>
            </header>

            <Tabs
                value={tab}
                onValueChange={(value) =>
                    fieldEditMode.setTab(value as FieldPanelTab)
                }
                className="flex min-h-0 w-[28rem] flex-1 flex-col"
            >
                <TabsList>
                    {TABS.map((id) => (
                        <TabItem
                            key={id}
                            value={id}
                            data-testid={`field-tab-${id}`}
                        >
                            {t(`fieldEditMode.panel.tabs.${id}`)}
                        </TabItem>
                    ))}
                </TabsList>
                {fp &&
                    TABS.map((id) => (
                        <TabContent
                            key={id}
                            value={id}
                            // The Lines tab scrolls its list and pins its Line section; only a
                            // window too short for both scrolls the whole tab
                            className="flex min-h-0 flex-1 flex-col gap-24 overflow-y-auto pr-4 pb-12"
                        >
                            {id === "setup" && <SetupTab fp={fp} />}
                            {id === "lines" && <LinesTab fp={fp} />}
                            {id === "appearance" && <AppearanceTab fp={fp} />}
                        </TabContent>
                    ))}
            </Tabs>
        </div>
    );
}
