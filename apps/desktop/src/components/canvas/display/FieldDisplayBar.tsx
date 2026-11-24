import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipClassName } from "@openmarch/ui";
import { useFieldLayerRef } from "@/components/canvas/fieldLayers";
import {
    BoundingBoxIcon,
    HandGrabbingIcon,
    ListNumbersIcon,
    QuestionIcon,
    TextAaIcon,
    type Icon,
} from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import { useId, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
    ShortcutTooltip,
    TransportTooltipProvider,
} from "@/components/timeline/ShortcutTooltip";
import {
    useUiSettingsStore,
    type EquipmentIconPlace,
    type EquipmentIcons,
    type MarcherLabelForm,
    type ShapeOutlines,
    type UiSettings,
} from "@/stores/UiSettingsStore";
import type { ActionId } from "@/shortcuts/definitions";
import { DISPLAY_BUTTON_CLASS, DisplayCaption } from "./displayButton";
import { StartFlagPositionsButton } from "./StartFlagPositionsButton";
import SelectToolBar from "./SelectToolBar";
import VenueButton from "./VenueButton";
import { MENU_BUTTON_CLASS } from "@/components/ui/popupClasses";
import { useShowsSelectTool } from "@/field/fieldSelectTool";
import { useFollowTheLeader } from "@/pathways/followTheLeader";

const BAR_CLASS =
    "border-stroke bg-bg-1 text-text rounded-8 pointer-events-auto flex flex-col items-center gap-4 border p-4 shadow-lg";

const POPOVER_CLASS =
    "border-stroke bg-modal text-text shadow-modal rounded-6 z-50 flex flex-col gap-4 border p-8 backdrop-blur-32";

const LABEL_CHOICES: readonly Choice<MarcherLabelForm>[] = [
    { value: "auto", key: "toolbar.view.labelsAuto" },
    { value: "names", key: "toolbar.view.labelsNames" },
    { value: "numbers", key: "toolbar.view.labelsNumbers" },
    { value: "off", key: "toolbar.view.labelsOff" },
];
const SHAPE_CHOICES: readonly Choice<ShapeOutlines>[] = [
    { value: "selected", key: "toolbar.view.shapesSelected" },
    { value: "always", key: "toolbar.view.shapesAlways" },
    { value: "off", key: "toolbar.view.shapesOff" },
];

/** Who shows an equipment icon after their drill number (fork #992); the palette's names */
const EQUIPMENT_CHOICES: readonly Choice<EquipmentIcons>[] = [
    { value: "changed", key: "toolbar.view.equipmentChanged" },
    { value: "everyone", key: "toolbar.view.equipmentEveryone" },
    { value: "off", key: "toolbar.view.equipmentOff" },
];

/** Where those icons go (fork #992); the palette's names */
const EQUIPMENT_PLACE_CHOICES: readonly Choice<EquipmentIconPlace>[] = [
    { value: "beside", key: "toolbar.view.equipmentBeside" },
    { value: "dot", key: "toolbar.view.equipmentOnDot" },
    { value: "label", key: "toolbar.view.equipmentOnNumber" },
];

const ORDER_CHOICES: readonly Choice<ShapeOutlines>[] = [
    { value: "selected", key: "toolbar.view.orderSelected" },
    { value: "always", key: "toolbar.view.orderAlways" },
    { value: "off", key: "toolbar.view.orderOff" },
];

/**
 * How the field is displayed, apart from the timeline: a small bar at the field's top right (the
 * zoom controls hold the bottom right). It replaced the toolbar's View tab. Path overlays, marcher
 * labels, equipment icons (fork #992), placed shapes' outlines, the venue under the field (#1207)
 * and a line's order (pathways step 4g). The Select tool's Box
 * and Lasso sit above it in a bar of their own, outside the touch layout (whose pill has its own
 * drag modes).
 */
export default function FieldDisplayBar() {
    const { t } = useTranslate();
    const layerRef = useFieldLayerRef<HTMLDivElement>();
    const showsSelectTool = useShowsSelectTool();
    const followTheLeader = useFollowTheLeader();
    return (
        <TransportTooltipProvider>
            <div
                ref={layerRef}
                // #927: the pill and the shape editor bar keep off both bars
                data-field-layer="control"
                className="pointer-events-none absolute top-6 right-6 z-10 flex flex-col items-center gap-6"
            >
                {showsSelectTool && <SelectToolBar className={BAR_CLASS} />}
                <div
                    role="group"
                    aria-label={t("fieldDisplay.label")}
                    data-testid="field-display-bar"
                    className={BAR_CLASS}
                >
                    <StartFlagPositionsButton />
                    <ChoiceButton
                        setting="marcherLabels"
                        fallback="auto"
                        choices={LABEL_CHOICES}
                        // Drill-number text on the field
                        icon={TextAaIcon}
                        labelKey="toolbar.view.labels"
                        testId="field-display-labels"
                    />
                    {/* What performers hold, as an icon after their drill numbers (fork #992) */}
                    <ChoiceButton
                        setting="equipmentIcons"
                        fallback="changed"
                        choices={EQUIPMENT_CHOICES}
                        // What each performer holds
                        icon={HandGrabbingIcon}
                        labelKey="toolbar.view.equipment"
                        testId="field-display-equipment"
                        keepOpen
                        more={<EquipmentPlaceChoices />}
                    />
                    {/* Placed boxes' outlines (docs/timeline/research/shapes/07-placed-boxes.md) */}
                    <ChoiceButton
                        setting="shapes"
                        fallback="selected"
                        choices={SHAPE_CHOICES}
                        icon={BoundingBoxIcon}
                        labelKey="toolbar.view.shapes"
                        testId="field-display-shapes"
                    />
                    {/* The show's 3D venue under the grid (#1207) */}
                    <VenueButton />
                    {/* A line's order (pathways step 4g): Show order, Alt+O. Only with
                        Follow-the-leader on (#1095) */}
                    {followTheLeader && (
                        <ChoiceButton
                            setting="lineOrder"
                            fallback="off"
                            choices={ORDER_CHOICES}
                            icon={ListNumbersIcon}
                            labelKey="toolbar.view.order"
                            testId="field-display-order"
                            action="toggleMarcherOrder"
                        />
                    )}
                </div>
            </div>
        </TransportTooltipProvider>
    );
}

interface Choice<T extends string> {
    readonly value: T;
    readonly key: string;
}

/**
 * One setting picked from a short list (marcher labels, shape outlines): an icon that opens the
 * choices beside the bar as radio buttons, dimmed while the setting is off. Picking one closes
 * them, as the View tab's select did.
 */
function ChoiceButton<
    K extends "marcherLabels" | "shapes" | "lineOrder" | "equipmentIcons",
>({
    setting,
    fallback,
    choices,
    icon: IconComponent,
    labelKey,
    testId,
    action,
    more,
    keepOpen = false,
}: {
    setting: K;
    fallback: NonNullable<UiSettings[K]>;
    choices: readonly Choice<NonNullable<UiSettings[K]>>[];
    icon: Icon;
    labelKey: string;
    testId: string;
    /** The action that toggles it, whose shortcut the tooltip shows */
    action?: ActionId;
    /** More choices under these, in the same popup */
    more?: ReactNode;
    /** Picking one leaves the popup open (with `more`, to pick there too) */
    keepOpen?: boolean;
}) {
    const { t } = useTranslate();
    const value = useUiSettingsStore((s) => s.uiSettings[setting] ?? fallback);
    const label = t(labelKey);
    const currentKey = choices.find((c) => c.value === value)?.key;
    const current = currentKey ? t(currentKey) : undefined;
    const [open, setOpen] = useState(false);
    const headingId = useId();
    const choose = (next: NonNullable<UiSettings[K]>) => {
        const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
        setUiSettings({ ...uiSettings, [setting]: next });
        if (!keepOpen) setOpen(false);
    };
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <ShortcutTooltip
                label={label}
                hint={current}
                side="left"
                action={action}
            >
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={
                            current
                                ? t("fieldDisplay.valueLabel", {
                                      label,
                                      value: current,
                                  })
                                : label
                        }
                        data-testid={testId}
                        className={clsx(
                            DISPLAY_BUTTON_CLASS,
                            value === "off"
                                ? "text-text-disabled"
                                : "text-text",
                        )}
                    >
                        <IconComponent size={16} />
                        <DisplayCaption>{label}</DisplayCaption>
                    </button>
                </Popover.Trigger>
            </ShortcutTooltip>
            <Popover.Portal>
                <Popover.Content
                    side="left"
                    align="start"
                    sideOffset={6}
                    aria-label={label}
                    className={POPOVER_CLASS}
                >
                    <h3
                        id={headingId}
                        className="text-sub text-text-subtitle px-8 pt-4 pb-2"
                    >
                        {label}
                    </h3>
                    <div
                        role="radiogroup"
                        aria-labelledby={headingId}
                        className="flex flex-col gap-4"
                    >
                        {choices.map((choice) => (
                            <button
                                key={choice.value}
                                type="button"
                                role="radio"
                                aria-checked={value === choice.value}
                                data-testid={`${testId}-${choice.value}`}
                                onClick={() => choose(choice.value)}
                                className={clsx(
                                    MENU_BUTTON_CLASS,
                                    value === choice.value && "text-accent",
                                )}
                            >
                                {t(choice.key)}
                            </button>
                        ))}
                    </div>
                    {more}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

/**
 * The Equipment icons popup's second row: where the icons go. Greyed out while the icons are
 * off, with the reason behind a ? (a press on a choice shows it too, rather than doing nothing).
 */
function EquipmentPlaceChoices() {
    const { t } = useTranslate();
    const shown = useUiSettingsStore(
        (s) => s.uiSettings.equipmentIcons ?? "changed",
    );
    const place = useUiSettingsStore(
        (s) => s.uiSettings.equipmentIconPlace ?? "beside",
    );
    const [tip, setTip] = useState(false);
    const headingId = useId();
    const reasonId = useId();
    const off = shown === "off";
    const reason = t("toolbar.view.equipmentPlaceOffReason");
    const choose = (next: EquipmentIconPlace) => {
        if (off) return setTip(true);
        const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
        setUiSettings({ ...uiSettings, equipmentIconPlace: next });
    };
    return (
        <>
            <div className="text-sub text-text-subtitle flex items-center px-8 pt-8 pb-2">
                <h3 id={headingId}>{t("toolbar.view.equipmentPlace")}</h3>
                {off && (
                    <Tooltip.Provider delayDuration={0}>
                        <Tooltip.Root open={tip} onOpenChange={setTip}>
                            <Tooltip.Trigger asChild>
                                <button
                                    type="button"
                                    aria-label={reason}
                                    data-testid="field-display-equipment-place-reason"
                                    className="hover:text-text ml-auto rounded-full"
                                    onClick={() => setTip(true)}
                                >
                                    <QuestionIcon size={14} />
                                </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                                <Tooltip.Content
                                    side="left"
                                    sideOffset={8}
                                    className={`${TooltipClassName} text-body max-w-[240px]`}
                                >
                                    {reason}
                                </Tooltip.Content>
                            </Tooltip.Portal>
                        </Tooltip.Root>
                    </Tooltip.Provider>
                )}
            </div>
            <div
                role="radiogroup"
                aria-labelledby={headingId}
                aria-describedby={off ? reasonId : undefined}
                aria-disabled={off || undefined}
                className="flex flex-col gap-4"
            >
                {EQUIPMENT_PLACE_CHOICES.map((choice) => (
                    <button
                        key={choice.value}
                        type="button"
                        role="radio"
                        aria-checked={place === choice.value}
                        aria-disabled={off || undefined}
                        data-testid={`field-display-equipment-place-${choice.value}`}
                        onClick={() => choose(choice.value)}
                        className={clsx(
                            MENU_BUTTON_CLASS,
                            off
                                ? "text-text-disabled"
                                : place === choice.value && "text-accent",
                        )}
                    >
                        {t(choice.key)}
                    </button>
                ))}
            </div>
            {off && (
                <span id={reasonId} hidden>
                    {reason}
                </span>
            )}
        </>
    );
}
