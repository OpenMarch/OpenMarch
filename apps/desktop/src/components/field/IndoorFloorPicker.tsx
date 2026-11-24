import * as RadioGroup from "@radix-ui/react-radio-group";
import { CheckCircleIcon, CircleIcon, ImageIcon } from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { useEffect, useId, useState } from "react";
import type { FieldProperties } from "@openmarch/core";
import type { DrillChartFieldImage } from "@/components/exporting/utils/drillChartSvg";
import { pickImage } from "@/field/editMode/useFieldImageActions";
import {
    FULL_SIZE_FLOOR,
    INDOOR_FLOOR_SIZES,
    INDOOR_STEP_SIZES,
    STEPS_BETWEEN_LINES,
    floorSizeForImage,
    indoorFloorOf,
    indoorFloorTemplate,
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
    columns: 2 | 4;
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
                columns === 4 ? "grid-cols-4" : "grid-cols-2",
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
                            <span className="text-text text-body font-medium whitespace-nowrap tabular-nums">
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
 * size in feet and the grid's step size. Adding the art picks the floor size with the same
 * shape. `template` must be an indoor floor template (`indoorFloorOf`).
 */
export default function IndoorFloorPicker({
    template,
    image,
    drawn,
    onChange,
    onOtherFields,
}: {
    template: FieldProperties;
    /** The floor's art, or null for none */
    image: Uint8Array | null;
    /** `image` read for drawing (`useFloorImage`) */
    drawn: DrillChartFieldImage | null;
    onChange: (template: FieldProperties, image: Uint8Array | null) => void;
    /** Shows every field template instead */
    onOtherFields: () => void;
}) {
    const { t } = useTranslate();
    const idPrefix = useId();
    const floor = indoorFloorOf(template)!;
    const [unreadable, setUnreadable] = useState(false);

    const sizeText = (size: IndoorFloorSize) =>
        t("fieldProperties.indoorFloor.sizeFeet", {
            depth: size.depthFeet,
            width: size.widthFeet,
        });

    const choose = (
        size: IndoorFloorSize,
        stepInches: IndoorStepInches,
        nextImage = image,
    ) => onChange(indoorFloorTemplate(size, stepInches), nextImage);

    const addImage = async () => {
        const bytes = await pickImage();
        if (!bytes) return;
        const read = await readFloorImage(bytes);
        if (!read) {
            setUnreadable(true);
            return;
        }
        setUnreadable(false);
        const match = floorSizeForImage(read.width, read.height, floor.size);
        choose(match ?? floor.size, floor.stepInches, bytes);
    };

    const match = drawn
        ? floorSizeForImage(drawn.width, drawn.height, floor.size)
        : null;

    const sizeLabelId = `${idPrefix}-size`;
    const stepLabelId = `${idPrefix}-step`;
    const heading = "text-body text-text font-medium";

    return (
        <div className="flex flex-col gap-16" data-testid="indoor-floor-picker">
            <div className="flex flex-col gap-8">
                <span className={heading}>
                    {t("fieldProperties.indoorFloor.image")}
                </span>
                {drawn && image ? (
                    <div className="flex items-center gap-12">
                        <img
                            src={drawn.href}
                            alt=""
                            className="rounded-4 border-stroke h-48 w-auto max-w-120 shrink-0 border object-contain"
                            data-testid="indoor-floor-image"
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-6">
                            <span
                                className="text-text-subtitle text-sub"
                                data-testid="indoor-floor-image-match"
                            >
                                {match === null
                                    ? t("fieldProperties.indoorFloor.noMatch")
                                    : sameFloorSize(match, floor.size)
                                      ? t(
                                            "fieldProperties.indoorFloor.matches",
                                            {
                                                size: sizeText(match),
                                            },
                                        )
                                      : t(
                                            "fieldProperties.indoorFloor.shapedLike",
                                            {
                                                size: sizeText(match),
                                            },
                                        )}
                            </span>
                            <div className="flex flex-wrap gap-8">
                                {match && !sameFloorSize(match, floor.size) && (
                                    <Button
                                        size="compact"
                                        variant="secondary"
                                        onClick={() =>
                                            choose(match, floor.stepInches)
                                        }
                                    >
                                        {t(
                                            "fieldProperties.indoorFloor.useSize",
                                            {
                                                size: sizeText(match),
                                            },
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
                    value={sizeKey(floor.size)}
                    options={INDOOR_FLOOR_SIZES.map((size) => ({
                        value: sizeKey(size),
                        title: sizeText(size),
                        detail: sameFloorSize(size, FULL_SIZE_FLOOR)
                            ? t("fieldProperties.indoorFloor.fullSize")
                            : undefined,
                    }))}
                    onChange={(key) =>
                        choose(
                            INDOOR_FLOOR_SIZES.find((s) => sizeKey(s) === key)!,
                            floor.stepInches,
                        )
                    }
                    columns={4}
                    testId="indoor-floor-size"
                    labelledBy={sizeLabelId}
                />
            </div>

            <div className="flex flex-col gap-8">
                <span id={stepLabelId} className={heading}>
                    {t("fieldProperties.indoorFloor.stepSize")}
                </span>
                <OptionCards
                    value={String(floor.stepInches)}
                    options={INDOOR_STEP_SIZES.map(({ inches }) => ({
                        value: String(inches),
                        title: t(`fieldProperties.indoorFloor.step${inches}`),
                        detail: t("fieldProperties.indoorFloor.linesEvery", {
                            feet: (inches * STEPS_BETWEEN_LINES) / 12,
                            steps: STEPS_BETWEEN_LINES,
                        }),
                    }))}
                    onChange={(inches) =>
                        choose(floor.size, Number(inches) as IndoorStepInches)
                    }
                    columns={2}
                    testId="indoor-floor-step"
                    labelledBy={stepLabelId}
                />
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
