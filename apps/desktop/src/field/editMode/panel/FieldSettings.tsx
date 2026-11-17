import { useState } from "react";
import {
    DEFAULT_FIELD_THEME,
    FieldProperties,
    type FieldTheme,
    type RgbaColor,
} from "@openmarch/core";
import { useTolgee, useTranslate } from "@tolgee/react";
import {
    Button,
    getButtonClassName,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
    Slider,
} from "@openmarch/ui";
import ColorPicker from "@/components/ui/ColorPicker";
import { fieldLengthText } from "@/components/field/customizer/fieldSizeText";
import { shapeIcons, shapeOptions } from "@/components/field/customizer/utils";
import { useFieldImage } from "@/view3d/window/useFieldImage";
import ActionButton from "@/shortcuts/ActionButton";
import type { FieldSettingsPatch } from "@/field/edits";
import { useApplyFieldEdits } from "../useApplyFieldEdits";
import { fieldSizeSteps } from "../lines";
import {
    CommitInput,
    Group,
    Hint,
    parseNumber,
    Row,
    SubHeading,
    SwitchRow,
} from "./settingsInputs";
import { TemplateSection } from "./TemplateSection";

/**
 * The Field panel's Setup tab (#824): what the field is based on, its size and steps, and its
 * names. Every change is a field edit, one undo step.
 */
export function SetupTab({ fp }: { fp: FieldProperties }) {
    const { t } = useTranslate();
    return (
        <>
            <TemplateSection fp={fp} />
            <Group title={t("fieldEditMode.panel.sections.size")}>
                <SizeSection fp={fp} />
            </Group>
            <Group title={t("fieldEditMode.panel.sections.names")}>
                <NamesSection fp={fp} />
            </Group>
        </>
    );
}

/** The Field panel's Appearance tab (#824): markings and labels, the background image, colors */
export function AppearanceTab({ fp }: { fp: FieldProperties }) {
    const { t } = useTranslate();
    return (
        <>
            <Group title={t("fieldEditMode.panel.sections.markings")}>
                <MarkingsSection fp={fp} />
            </Group>
            <Group title={t("fieldEditMode.panel.sections.image")}>
                <ImageSection fp={fp} />
            </Group>
            <Group title={t("fieldEditMode.panel.sections.colors")}>
                <ColorsSection fp={fp} />
            </Group>
        </>
    );
}

function useSettings() {
    const apply = useApplyFieldEdits();
    return (patch: FieldSettingsPatch) =>
        void apply({ edit: "setFieldSettings", args: { patch } });
}

const fmt = (n: number) => String(Number(n.toFixed(2)));

function SizeSection({ fp }: { fp: FieldProperties }) {
    const { t, i18n } = useTranslateWithLanguage();
    const set = useSettings();
    const size = fieldSizeSteps(fp);
    const metric = fp.measurementSystem === "metric";
    const unit = t(
        metric
            ? "fieldProperties.units.centimeters"
            : "fieldProperties.units.inches",
    );
    const toInches = (value: number) =>
        metric ? FieldProperties.centimetersToInches(value) : value;
    const length = (steps: number) =>
        fieldLengthText(
            steps * fp.stepSizeInches,
            fp.measurementSystem,
            (key, params) => t(key, params as never),
            i18n,
        );
    const threshold = fp.stepSizeWarningThresholdInches;
    // Width and depth follow the outer lines; they're read here, not typed (changing them is
    // a later issue: moving the outer lines renamed them and left the drill behind)
    const extent = (steps: number, testId: string) => (
        <span
            className="text-text-subtitle text-right tabular-nums"
            data-testid={testId}
        >
            {t("fieldEditMode.size.extent", {
                steps: fmt(steps),
                length: length(steps),
            })}
        </span>
    );
    return (
        <>
            <Row label={t("fieldEditMode.size.width")}>
                {extent(size.width, "field-width")}
            </Row>
            <Row label={t("fieldEditMode.size.depth")}>
                {extent(size.depth, "field-depth")}
            </Row>
            <CommitInput
                label={t("fieldProperties.labels.stepSize")}
                title={t("fieldProperties.tooltips.stepSize")}
                unit={unit}
                stored={fmt(fp.stepSizeInUnits)}
                current={fp.stepSizeInUnits}
                parse={(text) => parseNumber(text, { min: 0, exclusive: true })}
                onCommit={(value) => set({ stepSizeInches: toInches(value) })}
                readout={t("fieldEditMode.size.stepsTo5", {
                    steps: fmt(180 / fp.stepSizeInches),
                })}
                numeric
                testId="field-step-size"
            />
            <CommitInput
                label={t("fieldProperties.labels.stepSizeWarningThreshold")}
                readout={
                    threshold > 0
                        ? t("fieldEditMode.size.stepsTo5", {
                              steps: fmt(180 / threshold),
                          })
                        : undefined
                }
                title={t("fieldProperties.tooltips.stepSizeWarningThreshold")}
                unit={unit}
                stored={fmt(fp.stepSizeWarningThresholdInUnits)}
                current={fp.stepSizeWarningThresholdInUnits}
                parse={(text) => parseNumber(text, { min: 0 })}
                onCommit={(value) =>
                    set({ stepSizeWarningThresholdInches: toInches(value) })
                }
                numeric
                testId="field-step-warning"
            />
            <Row label={t("fieldProperties.labels.measurementSystem")}>
                <Select
                    value={fp.measurementSystem}
                    onValueChange={(value) =>
                        set({
                            measurementSystem: value as "imperial" | "metric",
                        })
                    }
                >
                    <SelectTriggerButton
                        className={SELECT}
                        label={t("fieldProperties.labels.measurementSystem")}
                    />
                    <SelectContent>
                        <SelectGroup>
                            <SelectItem value="imperial">
                                {t("fieldProperties.options.imperial")}
                            </SelectItem>
                            <SelectItem value="metric">
                                {t("fieldProperties.options.metric")}
                            </SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </Row>
        </>
    );
}

/** A select in a row */
const SELECT = "h-26 w-full px-8";

/** `t` and the app language, for number and length text */
function useTranslateWithLanguage() {
    const { t } = useTranslate();
    const tolgee = useTolgee(["language"]);
    return { t, i18n: tolgee.getLanguage() };
}

/** Text of `min` to `max` characters (a template's own name is 41: fields get more room) */
const text =
    (min = 1, max = 40) =>
    (value: string) =>
        value.trim().length >= min && value.trim().length <= max
            ? { value: value.trim() }
            : null;

function NamesSection({ fp }: { fp: FieldProperties }) {
    const { t } = useTranslate();
    const set = useSettings();
    const sides = fp.sideDescriptions;
    const side = (
        key: "verboseLeft" | "verboseRight" | "terseLeft" | "terseRight",
        label: string,
        tooltip: string,
    ) => (
        <CommitInput
            label={label}
            title={tooltip}
            stored={sides[key]}
            current={sides[key]}
            parse={text()}
            onCommit={(value) => set({ sideDescriptions: { [key]: value } })}
            testId={`field-side-${key}`}
        />
    );
    return (
        <>
            <CommitInput
                label={t("fieldProperties.labels.fieldName")}
                hint={t("fieldEditMode.names.fieldNameHint")}
                stored={fp.name}
                current={fp.name}
                parse={text(1, 120)}
                onCommit={(name) => set({ name })}
                testId="field-name"
                stacked
            />
            <SubHeading>
                {t("fieldProperties.sections.sideDescriptions")}
            </SubHeading>
            <div className="flex flex-col gap-10">
                {side(
                    "verboseLeft",
                    t("fieldProperties.labels.directorsLeft"),
                    t("fieldProperties.tooltips.directorsLeft"),
                )}
                {side(
                    "verboseRight",
                    t("fieldProperties.labels.directorsRight"),
                    t("fieldProperties.tooltips.directorsRight"),
                )}
                {side(
                    "terseLeft",
                    t("fieldProperties.labels.leftAbbreviation"),
                    t("fieldProperties.tooltips.leftAbbreviation"),
                )}
                {side(
                    "terseRight",
                    t("fieldProperties.labels.rightAbbreviation"),
                    t("fieldProperties.tooltips.rightAbbreviation"),
                )}
            </div>
        </>
    );
}

function MarkingsSection({ fp }: { fp: FieldProperties }) {
    const { t } = useTranslate();
    const set = useSettings();
    const numbers = fp.yardNumberCoordinates;
    const yard = (
        key:
            | "homeStepsFromFrontToOutside"
            | "homeStepsFromFrontToInside"
            | "awayStepsFromFrontToInside"
            | "awayStepsFromFrontToOutside",
        label: string,
        tooltip: string,
    ) => {
        const value = numbers[key];
        return (
            <CommitInput<number | null>
                label={label}
                title={tooltip}
                unit={t("fieldEditMode.size.steps")}
                stored={value === undefined ? "" : fmt(value)}
                current={value ?? null}
                placeholder={t("fieldEditMode.popover.none")}
                parse={(text) =>
                    text.trim() === ""
                        ? { value: null }
                        : parseNumber(text, { min: 0 })
                }
                onCommit={(next) =>
                    set({ yardNumberCoordinates: { [key]: next } })
                }
                numeric
                testId={`field-yard-${key}`}
            />
        );
    };
    return (
        <>
            <div className="flex flex-col gap-10">
                <CommitInput
                    label={t("fieldProperties.labels.halfLineXInterval")}
                    title={t("fieldProperties.tooltips.halfLineXInterval")}
                    unit={t("fieldEditMode.size.steps")}
                    stored={
                        fp.halfLineXInterval ? fmt(fp.halfLineXInterval) : ""
                    }
                    current={fp.halfLineXInterval ?? 0}
                    placeholder={t("fieldEditMode.popover.none")}
                    parse={(text) => parseNumber(text, { min: 0, empty: 0 })}
                    onCommit={(value) => set({ halfLineXInterval: value })}
                    numeric
                    testId="field-half-x"
                />
                <CommitInput
                    label={t("fieldProperties.labels.halfLineYInterval")}
                    title={t("fieldProperties.tooltips.halfLineYInterval")}
                    unit={t("fieldEditMode.size.steps")}
                    stored={
                        fp.halfLineYInterval ? fmt(fp.halfLineYInterval) : ""
                    }
                    current={fp.halfLineYInterval ?? 0}
                    placeholder={t("fieldEditMode.popover.none")}
                    parse={(text) => parseNumber(text, { min: 0, empty: 0 })}
                    onCommit={(value) => set({ halfLineYInterval: value })}
                    numeric
                    testId="field-half-y"
                />
            </div>
            <SubHeading>{t("fieldEditMode.markings.edgeLabels")}</SubHeading>
            <SwitchRow
                label={t("fieldProperties.labels.top")}
                checked={fp.topLabelsVisible}
                onChange={(on) => set({ topLabelsVisible: on })}
                testId="field-labels-top"
            />
            <SwitchRow
                label={t("fieldProperties.labels.bottom")}
                checked={fp.bottomLabelsVisible}
                onChange={(on) => set({ bottomLabelsVisible: on })}
                testId="field-labels-bottom"
            />
            <SwitchRow
                label={t("fieldProperties.labels.left")}
                checked={fp.leftLabelsVisible}
                onChange={(on) => set({ leftLabelsVisible: on })}
                testId="field-labels-left"
            />
            <SwitchRow
                label={t("fieldProperties.labels.right")}
                checked={fp.rightLabelsVisible}
                onChange={(on) => set({ rightLabelsVisible: on })}
                testId="field-labels-right"
            />
            <SubHeading>{t("fieldEditMode.markings.yardNumbers")}</SubHeading>
            <Hint>{t("fieldEditMode.markings.yardNumbersHint")}</Hint>
            <div className="flex flex-col gap-10">
                {yard(
                    "homeStepsFromFrontToOutside",
                    t("fieldEditMode.markings.homeBottom"),
                    t("fieldProperties.tooltips.stepsFromFrontToHomeLabel"),
                )}
                {yard(
                    "homeStepsFromFrontToInside",
                    t("fieldEditMode.markings.homeTop"),
                    t("fieldProperties.tooltips.stepsFromFrontToHomeLabelTop"),
                )}
                {yard(
                    "awayStepsFromFrontToInside",
                    t("fieldEditMode.markings.awayTop"),
                    t("fieldProperties.tooltips.stepsFromFrontToAwayLabelTop"),
                )}
                {yard(
                    "awayStepsFromFrontToOutside",
                    t("fieldEditMode.markings.awayBottom"),
                    t(
                        "fieldProperties.tooltips.stepsFromFrontToAwayLabelBottom",
                    ),
                )}
            </div>
        </>
    );
}

function ImageSection({ fp }: { fp: FieldProperties }) {
    const { t } = useTranslate();
    const set = useSettings();
    const { image } = useFieldImage();
    const [opacity, setOpacity] = useState<number | null>(null);
    const ratio = (w: number, h: number) =>
        h > 0 ? String(Number((w / h).toFixed(2))) : "–";
    return (
        <>
            {/* Showing, fitting and fading an image only mean something once there is one */}
            {image && (
                <>
                    <SwitchRow
                        label={t("fieldProperties.labels.showBackgroundImage")}
                        checked={fp.showFieldImage}
                        onChange={(on) => set({ showFieldImage: on })}
                        testId="field-image-show"
                    />
                    <Row
                        label={t("fieldProperties.labels.conformMethod")}
                        title={t("fieldProperties.tooltips.conformMethod")}
                    >
                        <Select
                            value={fp.imageFillOrFit}
                            onValueChange={(value) =>
                                set({ imageFillOrFit: value as "fill" | "fit" })
                            }
                        >
                            <SelectTriggerButton
                                className={SELECT}
                                label={t(
                                    "fieldProperties.labels.conformMethod",
                                )}
                            />
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="fit">
                                        {t("fieldProperties.options.fit")}
                                    </SelectItem>
                                    <SelectItem value="fill">
                                        {t("fieldProperties.options.fill")}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </Row>
                    <Row
                        label={
                            <>
                                {t(
                                    "fieldProperties.labels.backgroundImageOpacity",
                                )}{" "}
                                <span className="text-text-subtitle tabular-nums">
                                    {Math.round(
                                        (opacity ?? fp.backgroundImageOpacity) *
                                            100,
                                    )}
                                    %
                                </span>
                            </>
                        }
                    >
                        <Slider
                            aria-label={t(
                                "fieldProperties.labels.backgroundImageOpacity",
                            )}
                            className="w-full"
                            min={0}
                            max={100}
                            step={1}
                            value={[
                                (opacity ?? fp.backgroundImageOpacity) * 100,
                            ]}
                            onValueChange={([v]) => setOpacity((v ?? 0) / 100)}
                            onValueCommit={([v]) => {
                                setOpacity(null);
                                set({ backgroundImageOpacity: (v ?? 0) / 100 });
                            }}
                        />
                    </Row>
                </>
            )}
            <div className="flex flex-wrap gap-8 px-12">
                <ActionButton
                    action="fieldEditImportImage"
                    data-testid="field-image-import"
                    className={`${getButtonClassName({ variant: "secondary", size: "compact" })} text-body`}
                >
                    {t("fieldProperties.buttons.importImage")}
                </ActionButton>
                {image && (
                    <ActionButton
                        action="fieldEditRemoveImage"
                        data-testid="field-image-remove"
                        className={`${getButtonClassName({ variant: "secondary", size: "compact" })} text-body text-red`}
                    >
                        {t("fieldEditMode.image.remove")}
                    </ActionButton>
                )}
            </div>
            {image && (
                <span data-testid="field-image-ratio">
                    <Hint>
                        {t("fieldEditMode.image.ratios", {
                            field: ratio(fp.width, fp.height),
                            image: image
                                ? ratio(image.width, image.height)
                                : "–",
                        })}
                    </Hint>
                </span>
            )}
        </>
    );
}

type ColorKey = Exclude<keyof FieldTheme, "shapeType" | "defaultMarcher">;
type MarcherColorKey = keyof FieldTheme["defaultMarcher"];

const isRgba = (c: unknown): c is RgbaColor =>
    typeof c === "object" &&
    c !== null &&
    ["r", "g", "b", "a"].every(
        (k) => typeof (c as Record<string, unknown>)[k] === "number",
    );
const sameColor = (a: RgbaColor, b: RgbaColor) =>
    a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;

function ColorsSection({ fp }: { fp: FieldProperties }) {
    const { t } = useTranslate();
    const set = useSettings();
    const theme = fp.theme;
    const color = (key: ColorKey, label: string) => (
        <ColorPicker
            key={key}
            doNotUseForm
            label={label}
            initialColor={theme[key]}
            defaultColor={DEFAULT_FIELD_THEME[key]}
            onBlur={(picked) => {
                if (!isRgba(picked) || sameColor(picked, theme[key])) return;
                set({ theme: { [key]: picked } });
            }}
        />
    );
    const marcher = (key: MarcherColorKey, label: string) => (
        <ColorPicker
            key={key}
            doNotUseForm
            label={label}
            initialColor={theme.defaultMarcher[key]}
            defaultColor={DEFAULT_FIELD_THEME.defaultMarcher[key]}
            onBlur={(picked) => {
                if (
                    !isRgba(picked) ||
                    sameColor(picked, theme.defaultMarcher[key])
                )
                    return;
                set({ theme: { defaultMarcher: { [key]: picked } } });
            }}
        />
    );
    return (
        <>
            <SubHeading>{t("fieldEditMode.colors.field")}</SubHeading>
            {color("background", t("fieldProperties.labels.background"))}
            {color("primaryStroke", t("fieldProperties.labels.primaryLines"))}
            {color(
                "secondaryStroke",
                t("fieldProperties.labels.secondaryLines"),
            )}
            {color("tertiaryStroke", t("fieldProperties.labels.gridLines"))}
            {color("fieldLabel", t("fieldProperties.labels.fieldLabels"))}
            {color("externalLabel", t("fieldProperties.labels.externalLabels"))}
            <SubHeading>{t("fieldEditMode.colors.marchers")}</SubHeading>
            {color("previousPath", t("fieldProperties.labels.previousPath"))}
            {color("nextPath", t("fieldProperties.labels.nextPath"))}
            {color("tempPath", t("fieldProperties.labels.temporaryPath"))}
            {marcher("fill", t("fieldProperties.labels.marcherFill"))}
            {marcher("outline", t("fieldProperties.labels.marcherOutline"))}
            {marcher("label", t("fieldProperties.labels.marcherText"))}
            {color("shape", t("fieldProperties.labels.shapes"))}
            <Row label={t("fieldProperties.labels.shapeType")}>
                <Select
                    value={theme.shapeType ?? "circle"}
                    onValueChange={(value) =>
                        set({ theme: { shapeType: value } })
                    }
                >
                    <SelectTriggerButton
                        className={SELECT}
                        label={t("fieldProperties.labels.shapeType")}
                    />
                    <SelectContent>
                        <SelectGroup>
                            {shapeOptions.map((shape) => (
                                <SelectItem key={shape} value={shape}>
                                    <span className="flex items-center gap-6">
                                        {shapeIcons[shape]}
                                        {t(
                                            `fieldEditMode.colors.shapes.${shape}`,
                                        )}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </Row>
            <Button
                size="compact"
                variant="secondary"
                className="mx-12 w-fit"
                title={t("fieldProperties.tooltips.resetTheme")}
                onClick={() => set({ theme: { ...DEFAULT_FIELD_THEME } })}
            >
                {t("fieldProperties.buttons.resetTheme")}
            </Button>
        </>
    );
}
