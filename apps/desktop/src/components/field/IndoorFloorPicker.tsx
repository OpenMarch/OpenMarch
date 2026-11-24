import * as RadioGroup from "@radix-ui/react-radio-group";
import { CheckCircleIcon, CircleIcon, ImageIcon } from "@phosphor-icons/react";
import { Button, UnitInput } from "@openmarch/ui";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { useEffect, useId, useMemo, useState } from "react";
import { FieldProperties } from "@openmarch/core";
import type { DrillChartFieldImage } from "@/components/exporting/utils/drillChartSvg";
import { pickImage } from "@/field/editMode/useFieldImageActions";
import {
    FLOOR_FEET_RANGE,
    FULL_SIZE_FLOOR,
    INDOOR_FLOOR_SIZES,
    INDOOR_STEP_SIZES,
    STEPS_BETWEEN_LINES,
    STEP_INCHES_RANGE,
    floorFitsImage,
    floorShapedLikeImage,
    floorSizeForImage,
    indoorFloorOf,
    indoorFloorTemplate,
    isStockFloorSize,
    isStockStepSize,
    sameFloorSize,
    type IndoorFloorSize,
    type IndoorStepInches,
} from "@/global/classes/fieldTemplates/indoorFloors";

/** A floor image's bytes read for drawing: a data URL (SVG previews load no blob URLs) and its size */
export async function readFloorImage(
    bytes: Uint8Array,
): Promise<DrillChartFieldImage | null> {
    const blob = new Blob([bytes as BlobPart]);
    try {
        const bitmap = await createImageBitmap(blob);
        const { width, height } = bitmap;
        bitmap.close();
        const href = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
        return { href, width, height };
    } catch {
        return null;
    }
}

/** A floor image's bytes read for drawing, or null while there is none (or it can't be read) */
export function useFloorImage(
    image: Uint8Array | null | undefined,
): DrillChartFieldImage | null {
    const [drawn, setDrawn] = useState<DrillChartFieldImage | null>(null);
    useEffect(() => {
        let live = true;
        if (!image) {
            setDrawn(null);
            return;
        }
        void readFloorImage(image).then((read) => {
            if (live) setDrawn(read);
        });
        return () => {
            live = false;
        };
    }, [image]);
    return drawn;
}

const sizeKey = (size: IndoorFloorSize) =>
    `${size.depthFeet}x${size.widthFeet}`;

const CUSTOM = "custom";

/** Feet to one decimal place, so a 22.5-inch step's lines read "7.5 ft" */
const roundTenth = (value: number) => Math.round(value * 10) / 10;

/**
 * A number typed in a unit, saved as it's typed while it's in `range`. Outside the range it isn't
 * saved: `rangeHint` shows under it, and `onValidChange(false)` lets the wizard hold Next.
 */
function NumberField({
    label,
    value,
    unit,
    range,
    rangeHint,
    onCommit,
    onValidChange,
    testId,
}: {
    label: string;
    value: number;
    unit: string;
    range: { min: number; max: number };
    rangeHint: string;
    onCommit: (value: number) => void;
    onValidChange: (valid: boolean) => void;
    testId: string;
}) {
    const id = useId();
    const hintId = `${id}-hint`;
    const [draft, setDraft] = useState(String(value));
    const parsed = parseFloat(draft);
    const invalid = isNaN(parsed) || parsed < range.min || parsed > range.max;

    // A value set from outside (an image's shape, another activity) replaces what's typed;
    // the value just saved from typing leaves the draft alone, so "22." can become "22.5"
    useEffect(() => {
        setDraft((current) =>
            parseFloat(current) === value ? current : String(value),
        );
    }, [value]);

    useEffect(() => {
        onValidChange(!invalid);
    }, [invalid, onValidChange]);
    // A field that goes away (another card picked) no longer holds Next
    useEffect(() => () => onValidChange(true), [onValidChange]);

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <label htmlFor={id} className="text-text-subtitle text-sub">
                {label}
            </label>
            <UnitInput
                id={id}
                type="text"
                inputMode="decimal"
                unit={unit}
                value={draft}
                aria-invalid={invalid}
                aria-describedby={invalid ? hintId : undefined}
                onChange={(e) => {
                    const next = e.target.value
                        .replace(/[^\d.]/g, "")
                        .replace(/\.+/g, ".");
                    setDraft(next);
                    const number = parseFloat(next);
                    if (
                        !isNaN(number) &&
                        number >= range.min &&
                        number <= range.max &&
                        number !== value
                    )
                        onCommit(number);
                }}
                data-testid={testId}
            />
            {invalid && (
                <span id={hintId} className="text-red text-sub">
                    {rangeHint}
                </span>
            )}
        </div>
    );
}

/**
 * Cards in a radio group, as the new show's other card questions draw them: arrow keys move
 * between them, the picked one is outlined in the accent color.
 */
function OptionCards<V extends string>({
    value,
    options,
    onChange,
    columns,
    testId,
    labelledBy,
}: {
    value: V;
    options: { value: V; title: string; detail?: string }[];
    onChange: (value: V) => void;
    columns: 3 | 4;
    testId: string;
    labelledBy: string;
}) {
    return (
        <RadioGroup.Root
            value={value}
            onValueChange={(next) => onChange(next as V)}
            aria-labelledby={labelledBy}
            className={clsx(
                "grid gap-8",
                columns === 4 ? "grid-cols-4" : "grid-cols-3",
            )}
            data-testid={testId}
        >
            {options.map((option) => {
                const checked = option.value === value;
                return (
                    <RadioGroup.Item
                        key={option.value}
                        value={option.value}
                        data-testid={`${testId}-${option.value}`}
                        className={clsx(
                            "rounded-6 flex min-w-0 flex-col items-start gap-2 border px-8 py-6 text-left transition-colors duration-150 ease-out",
                            "focus-visible:outline-accent outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2",
                            checked
                                ? "bg-accent/20 border-accent"
                                : "bg-fg-2 border-stroke hover:border-accent/60",
                        )}
                    >
                        <span className="flex items-center gap-6">
                            {checked ? (
                                <CheckCircleIcon
                                    size={16}
                                    weight="fill"
                                    className="text-accent shrink-0"
                                />
                            ) : (
                                <CircleIcon
                                    size={16}
                                    className="text-text/50 shrink-0"
                                />
                            )}
                            <span className="text-text text-body font-medium tabular-nums">
                                {option.title}
                            </span>
                        </span>
                        {option.detail && (
                            <span className="text-text-subtitle text-sub">
                                {option.detail}
                            </span>
                        )}
                    </RadioGroup.Item>
                );
            })}
        </RadioGroup.Root>
    );
}

/**
 * An indoor floor for a new show, as floor makers sell them: its printed art (optional), its
 * size in feet and the grid's step size, each a stock choice or a custom number. Adding the art
 * picks the floor size with the same shape. `template` must be an indoor floor (`indoorFloorOf`).
 */
export default function IndoorFloorPicker({
    template,
    image,
    drawn,
    onChange,
    onOtherFields,
    onIncompleteChange,
}: {
    template: FieldProperties;
    /** The floor's art, or null for none */
    image: Uint8Array | null;
    /** `image` read for drawing (`useFloorImage`) */
    drawn: DrillChartFieldImage | null;
    onChange: (template: FieldProperties, image: Uint8Array | null) => void;
    /** Shows every field template instead */
    onOtherFields: () => void;
    /** True while a custom number is out of range, so the wizard holds Next */
    onIncompleteChange: (incomplete: boolean) => void;
}) {
    const { t } = useTranslate();
    const idPrefix = useId();
    const floor = indoorFloorOf(template)!;
    const [unreadable, setUnreadable] = useState(false);
    // The Custom cards stay picked while a custom number happens to equal a stock one
    const [customSize, setCustomSize] = useState(
        () => !isStockFloorSize(floor.size),
    );
    const [customStep, setCustomStep] = useState(
        () => !isStockStepSize(floor.stepInches),
    );

    const sizeText = (size: IndoorFloorSize) =>
        t("fieldProperties.indoorFloor.sizeFeet", {
            depth: size.depthFeet,
            width: size.widthFeet,
        });
    const feet = t("fieldProperties.indoorFloor.feet");
    const inches = t("fieldProperties.units.inches");

    // Which custom number fields hold a number out of range
    const [invalidFields, setInvalidFields] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const validity = useMemo(() => {
        const track = (name: string) => (valid: boolean) =>
            setInvalidFields((current) => {
                if (valid !== current.has(name)) return current;
                const next = new Set(current);
                if (valid) next.delete(name);
                else next.add(name);
                return next;
            });
        return {
            depth: track("depth"),
            width: track("width"),
            step: track("step"),
        };
    }, []);
    const incomplete = invalidFields.size > 0;
    useEffect(() => {
        onIncompleteChange(incomplete);
    }, [incomplete, onIncompleteChange]);
    // Leaving the picker (Other fields, another activity) leaves nothing to finish
    useEffect(() => () => onIncompleteChange(false), [onIncompleteChange]);

    const choose = (
        size: IndoorFloorSize,
        stepInches: IndoorStepInches,
        nextImage = image,
    ) => {
        // A new floor keeps the step size warning threshold already set
        const next = indoorFloorTemplate(size, stepInches);
        const threshold = template.stepSizeWarningThresholdInches;
        onChange(
            next.stepSizeWarningThresholdInches === threshold
                ? next
                : new FieldProperties({
                      ...next,
                      stepSizeWarningThresholdInches: threshold,
                  }),
            nextImage,
        );
    };

    /** Picks a size from the cards or the image, leaving the custom size behind */
    const chooseStockSize = (size: IndoorFloorSize, nextImage = image) => {
        setCustomSize(false);
        choose(size, floor.stepInches, nextImage);
    };

    const addImage = async () => {
        const bytes = await pickImage();
        if (!bytes) return;
        const read = await readFloorImage(bytes);
        if (!read) {
            setUnreadable(true);
            return;
        }
        setUnreadable(false);
        // A floor that already has the art's shape stays, custom or not
        const match = floorFitsImage(read.width, read.height, floor.size)
            ? null
            : floorSizeForImage(read.width, read.height, floor.size);
        if (match) chooseStockSize(match, bytes);
        else choose(floor.size, floor.stepInches, bytes);
    };

    const fits = drawn
        ? floorFitsImage(drawn.width, drawn.height, floor.size)
        : false;
    const stockMatch = drawn
        ? floorSizeForImage(drawn.width, drawn.height, floor.size)
        : null;
    // With no stock floor of the image's shape, a custom one as deep as this floor
    const shapedFloor =
        drawn && !fits && !stockMatch
            ? floorShapedLikeImage(drawn.width, drawn.height, floor.size)
            : null;

    let matchText: string;
    if (fits)
        matchText =
            customSize || !isStockFloorSize(floor.size)
                ? t("fieldProperties.indoorFloor.matchesCustom")
                : t("fieldProperties.indoorFloor.matches", {
                      size: sizeText(floor.size),
                  });
    else if (stockMatch)
        matchText = t("fieldProperties.indoorFloor.shapedLike", {
            size: sizeText(stockMatch),
        });
    else matchText = t("fieldProperties.indoorFloor.noMatch");

    const sizeLabelId = `${idPrefix}-size`;
    const stepLabelId = `${idPrefix}-step`;
    const heading = "text-body text-text font-medium";

    const linesEvery = (stepInches: number) =>
        t("fieldProperties.indoorFloor.linesEvery", {
            feet: roundTenth((stepInches * STEPS_BETWEEN_LINES) / 12),
            steps: STEPS_BETWEEN_LINES,
        });

    return (
        <div className="flex flex-col gap-20" data-testid="indoor-floor-picker">
            <div className="flex flex-col gap-8">
                <span className={heading}>
                    {t("fieldProperties.indoorFloor.image")}
                </span>
                {drawn && image ? (
                    <div className="flex items-center gap-12">
                        <img
                            src={drawn.href}
                            alt=""
                            className="rounded-4 border-stroke h-64 w-auto max-w-160 shrink-0 border object-contain"
                            data-testid="indoor-floor-image"
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-6">
                            <span
                                className="text-text-subtitle text-sub"
                                data-testid="indoor-floor-image-match"
                            >
                                {matchText}
                            </span>
                            <div className="flex flex-wrap gap-8">
                                {stockMatch && !fits && (
                                    <Button
                                        size="compact"
                                        variant="secondary"
                                        onClick={() =>
                                            chooseStockSize(stockMatch)
                                        }
                                    >
                                        {t(
                                            "fieldProperties.indoorFloor.useSize",
                                            { size: sizeText(stockMatch) },
                                        )}
                                    </Button>
                                )}
                                {shapedFloor && (
                                    <Button
                                        size="compact"
                                        variant="secondary"
                                        onClick={() => {
                                            setCustomSize(true);
                                            choose(
                                                shapedFloor,
                                                floor.stepInches,
                                            );
                                        }}
                                        data-testid="indoor-floor-image-shape"
                                    >
                                        {t(
                                            "fieldProperties.indoorFloor.useSize",
                                            { size: sizeText(shapedFloor) },
                                        )}
                                    </Button>
                                )}
                                <Button
                                    size="compact"
                                    variant="secondary"
                                    onClick={() => void addImage()}
                                >
                                    {t(
                                        "fieldProperties.indoorFloor.replaceImage",
                                    )}
                                </Button>
                                <Button
                                    size="compact"
                                    variant="secondary"
                                    onClick={() => onChange(template, null)}
                                    data-testid="indoor-floor-image-remove"
                                >
                                    {t(
                                        "fieldProperties.indoorFloor.removeImage",
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-start gap-6">
                        <Button
                            size="compact"
                            variant="secondary"
                            onClick={() => void addImage()}
                            data-testid="indoor-floor-image-add"
                        >
                            <ImageIcon size={16} />
                            {t("fieldProperties.indoorFloor.addImage")}
                        </Button>
                        <span className="text-text-subtitle text-sub">
                            {unreadable
                                ? t("fieldProperties.indoorFloor.unreadable")
                                : t("fieldProperties.indoorFloor.imageHint")}
                        </span>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-8">
                <span id={sizeLabelId} className={heading}>
                    {t("fieldProperties.indoorFloor.size")}
                </span>
                <OptionCards
                    value={customSize ? CUSTOM : sizeKey(floor.size)}
                    options={[
                        ...INDOOR_FLOOR_SIZES.map((size) => ({
                            value: sizeKey(size),
                            title: sizeText(size),
                            detail: sameFloorSize(size, FULL_SIZE_FLOOR)
                                ? t("fieldProperties.indoorFloor.fullSize")
                                : undefined,
                        })),
                        {
                            value: CUSTOM,
                            title: t("fieldProperties.indoorFloor.custom"),
                            detail: customSize
                                ? sizeText(floor.size)
                                : t("fieldProperties.indoorFloor.anySize"),
                        },
                    ]}
                    onChange={(key) => {
                        if (key === CUSTOM) setCustomSize(true);
                        else
                            chooseStockSize(
                                INDOOR_FLOOR_SIZES.find(
                                    (s) => sizeKey(s) === key,
                                )!,
                            );
                    }}
                    columns={4}
                    testId="indoor-floor-size"
                    labelledBy={sizeLabelId}
                />
                {customSize && (
                    <div className="grid grid-cols-2 gap-12">
                        <NumberField
                            label={t("fieldProperties.indoorFloor.depth")}
                            value={floor.size.depthFeet}
                            unit={feet}
                            range={FLOOR_FEET_RANGE}
                            rangeHint={t(
                                "fieldProperties.indoorFloor.feetRange",
                                FLOOR_FEET_RANGE,
                            )}
                            onCommit={(depthFeet) =>
                                choose(
                                    { ...floor.size, depthFeet },
                                    floor.stepInches,
                                )
                            }
                            onValidChange={validity.depth}
                            testId="indoor-floor-custom-depth"
                        />
                        <NumberField
                            label={t("fieldProperties.indoorFloor.width")}
                            value={floor.size.widthFeet}
                            unit={feet}
                            range={FLOOR_FEET_RANGE}
                            rangeHint={t(
                                "fieldProperties.indoorFloor.feetRange",
                                FLOOR_FEET_RANGE,
                            )}
                            onCommit={(widthFeet) =>
                                choose(
                                    { ...floor.size, widthFeet },
                                    floor.stepInches,
                                )
                            }
                            onValidChange={validity.width}
                            testId="indoor-floor-custom-width"
                        />
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-8">
                <span id={stepLabelId} className={heading}>
                    {t("fieldProperties.indoorFloor.stepSize")}
                </span>
                <OptionCards
                    value={customStep ? CUSTOM : String(floor.stepInches)}
                    options={[
                        ...INDOOR_STEP_SIZES.map((step) => ({
                            value: String(step.inches),
                            title: t(
                                `fieldProperties.indoorFloor.step${step.inches}`,
                            ),
                            detail: linesEvery(step.inches),
                        })),
                        {
                            value: CUSTOM,
                            title: t("fieldProperties.indoorFloor.custom"),
                            detail: customStep
                                ? linesEvery(floor.stepInches)
                                : t("fieldProperties.indoorFloor.anyStep"),
                        },
                    ]}
                    onChange={(value) => {
                        if (value === CUSTOM) {
                            setCustomStep(true);
                            return;
                        }
                        setCustomStep(false);
                        choose(floor.size, Number(value));
                    }}
                    columns={3}
                    testId="indoor-floor-step"
                    labelledBy={stepLabelId}
                />
                {customStep && (
                    <div className="grid grid-cols-2 gap-12">
                        <NumberField
                            label={t("fieldProperties.indoorFloor.stepLength")}
                            value={floor.stepInches}
                            unit={inches}
                            range={STEP_INCHES_RANGE}
                            rangeHint={t(
                                "fieldProperties.indoorFloor.inchesRange",
                                STEP_INCHES_RANGE,
                            )}
                            onCommit={(stepInches) =>
                                choose(floor.size, stepInches)
                            }
                            onValidChange={validity.step}
                            testId="indoor-floor-custom-step"
                        />
                    </div>
                )}
            </div>

            <Button
                size="compact"
                variant="secondary"
                className="self-start"
                onClick={onOtherFields}
                data-testid="indoor-floor-other-fields"
            >
                {t("fieldProperties.indoorFloor.otherFields")}
            </Button>
        </div>
    );
}
