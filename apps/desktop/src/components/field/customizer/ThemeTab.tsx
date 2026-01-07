import {
    FieldProperties,
    DEFAULT_FIELD_THEME,
    ShapeType,
    FieldTheme,
} from "@openmarch/core";
import { TabContent, Button } from "@openmarch/ui";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { RgbaColor } from "@uiw/react-color";
import { T, useTolgee } from "@tolgee/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateFieldPropertiesMutationOptions } from "@/hooks/queries";
import ColorPicker from "../../ui/ColorPicker";
import { StaticFormField } from "../../ui/FormField";
import { inputClassname, shapeOptions, shapeIcons } from "./utils";
import { ArrowUUpLeftIcon } from "@phosphor-icons/react";

interface ThemeTabProps {
    currentFieldProperties: FieldProperties;
    validateIsRgbaColor: (
        themeProperty: keyof FieldTheme,
        fieldProperties: FieldProperties,
    ) => boolean;
}

export function ThemeTab({
    currentFieldProperties,
    validateIsRgbaColor,
}: ThemeTabProps) {
    const { t } = useTolgee();
    const queryClient = useQueryClient();
    const { mutate: updateFieldProperties, isPending } = useMutation(
        updateFieldPropertiesMutationOptions(queryClient),
    );

    return (
        <TabContent value="theme" className="flex flex-col gap-32">
            {/* -------------------------------------------- THEME -------------------------------------------- */}
            <div className="flex flex-col gap-12">
                <h4 className="text-h4 mb-8">
                    <T keyName="fieldProperties.sections.theme" />
                </h4>

                <h5 className="text-h5 mb-8">
                    <T keyName="fieldProperties.themeSubsections.grid" />
                </h5>
                <ColorPicker
                    label={t("fieldProperties.labels.background")}
                    initialColor={currentFieldProperties.theme.background}
                    defaultColor={DEFAULT_FIELD_THEME.background as RgbaColor}
                    onBlur={(color: RgbaColor) => {
                        if (
                            validateIsRgbaColor(
                                "background",
                                currentFieldProperties,
                            )
                        )
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    theme: {
                                        ...currentFieldProperties.theme,
                                        background: color,
                                    },
                                }),
                            );
                    }}
                />
                <ColorPicker
                    label={t("fieldProperties.labels.primaryLines")}
                    initialColor={currentFieldProperties.theme.primaryStroke}
                    defaultColor={
                        DEFAULT_FIELD_THEME.primaryStroke as RgbaColor
                    }
                    onBlur={(color: RgbaColor) => {
                        if (
                            validateIsRgbaColor(
                                "primaryStroke",
                                currentFieldProperties,
                            )
                        )
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    theme: {
                                        ...currentFieldProperties.theme,
                                        primaryStroke: color,
                                    },
                                }),
                            );
                    }}
                />
                <ColorPicker
                    label={t("fieldProperties.labels.secondaryLines")}
                    initialColor={currentFieldProperties.theme.secondaryStroke}
                    defaultColor={
                        DEFAULT_FIELD_THEME.secondaryStroke as RgbaColor
                    }
                    onBlur={(color: RgbaColor) => {
                        if (
                            validateIsRgbaColor(
                                "secondaryStroke",
                                currentFieldProperties,
                            )
                        )
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    theme: {
                                        ...currentFieldProperties.theme,
                                        secondaryStroke: color,
                                    },
                                }),
                            );
                    }}
                />
                <ColorPicker
                    label={t("fieldProperties.labels.gridLines")}
                    initialColor={currentFieldProperties.theme.tertiaryStroke}
                    defaultColor={
                        DEFAULT_FIELD_THEME.tertiaryStroke as RgbaColor
                    }
                    onBlur={(color: RgbaColor) => {
                        if (
                            validateIsRgbaColor(
                                "tertiaryStroke",
                                currentFieldProperties,
                            )
                        )
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    theme: {
                                        ...currentFieldProperties.theme,
                                        tertiaryStroke: color,
                                    },
                                }),
                            );
                    }}
                />
                <h5 className="text-h5 mb-8">
                    <T keyName="fieldProperties.themeSubsections.labels" />
                </h5>
                <ColorPicker
                    label={t("fieldProperties.labels.fieldLabels")}
                    initialColor={currentFieldProperties.theme.fieldLabel}
                    defaultColor={DEFAULT_FIELD_THEME.fieldLabel as RgbaColor}
                    onBlur={(color: RgbaColor) => {
                        if (
                            validateIsRgbaColor(
                                "fieldLabel",
                                currentFieldProperties,
                            )
                        )
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    theme: {
                                        ...currentFieldProperties.theme,
                                        fieldLabel: color,
                                    },
                                }),
                            );
                    }}
                />
                <ColorPicker
                    label={t("fieldProperties.labels.externalLabels")}
                    initialColor={currentFieldProperties.theme.externalLabel}
                    defaultColor={
                        DEFAULT_FIELD_THEME.externalLabel as RgbaColor
                    }
                    onBlur={(color: RgbaColor) => {
                        if (
                            validateIsRgbaColor(
                                "externalLabel",
                                currentFieldProperties,
                            )
                        )
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    theme: {
                                        ...currentFieldProperties.theme,
                                        externalLabel: color,
                                    },
                                }),
                            );
                    }}
                />
                <h5 className="text-h5 mb-8">
                    <T keyName="fieldProperties.themeSubsections.pathways" />
                </h5>
                <ColorPicker
                    label={t("fieldProperties.labels.previousPath")}
                    initialColor={currentFieldProperties.theme.previousPath}
                    defaultColor={DEFAULT_FIELD_THEME.previousPath as RgbaColor}
                    onBlur={(color: RgbaColor) => {
                        if (
                            validateIsRgbaColor(
                                "previousPath",
                                currentFieldProperties,
                            )
                        )
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    theme: {
                                        ...currentFieldProperties.theme,
                                        previousPath: color,
                                    },
                                }),
                            );
                    }}
                />
                <ColorPicker
                    label={t("fieldProperties.labels.nextPath")}
                    initialColor={currentFieldProperties.theme.nextPath}
                    defaultColor={DEFAULT_FIELD_THEME.nextPath as RgbaColor}
                    onBlur={(color: RgbaColor) => {
                        if (
                            validateIsRgbaColor(
                                "nextPath",
                                currentFieldProperties,
                            )
                        )
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    theme: {
                                        ...currentFieldProperties.theme,
                                        nextPath: color,
                                    },
                                }),
                            );
                    }}
                />
                <ColorPicker
                    label={t("fieldProperties.labels.temporaryPath")}
                    initialColor={currentFieldProperties.theme.tempPath}
                    defaultColor={DEFAULT_FIELD_THEME.tempPath as RgbaColor}
                    onBlur={(color: RgbaColor) => {
                        if (
                            validateIsRgbaColor(
                                "tempPath",
                                currentFieldProperties,
                            )
                        )
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    theme: {
                                        ...currentFieldProperties.theme,
                                        tempPath: color,
                                    },
                                }),
                            );
                    }}
                />
                <h5 className="text-h5 mb-8">
                    <T keyName="fieldProperties.themeSubsections.marchers" />
                </h5>
                <ColorPicker
                    label={t("fieldProperties.labels.marcherFill")}
                    initialColor={
                        currentFieldProperties.theme.defaultMarcher.fill
                    }
                    defaultColor={DEFAULT_FIELD_THEME.defaultMarcher.fill}
                    onBlur={(color: RgbaColor) =>
                        updateFieldProperties(
                            new FieldProperties({
                                ...currentFieldProperties,
                                theme: {
                                    ...currentFieldProperties.theme,
                                    defaultMarcher: {
                                        ...currentFieldProperties.theme
                                            .defaultMarcher,
                                        fill: color,
                                    },
                                },
                            }),
                        )
                    }
                />
                <ColorPicker
                    label={t("fieldProperties.labels.marcherOutline")}
                    initialColor={
                        currentFieldProperties.theme.defaultMarcher.outline
                    }
                    defaultColor={DEFAULT_FIELD_THEME.defaultMarcher.outline}
                    onBlur={(color: RgbaColor) =>
                        updateFieldProperties(
                            new FieldProperties({
                                ...currentFieldProperties,
                                theme: {
                                    ...currentFieldProperties.theme,
                                    defaultMarcher: {
                                        ...currentFieldProperties.theme
                                            .defaultMarcher,
                                        outline: color,
                                    },
                                },
                            }),
                        )
                    }
                />
                <ColorPicker
                    label={t("fieldProperties.labels.marcherText")}
                    initialColor={
                        currentFieldProperties.theme.defaultMarcher.label
                    }
                    defaultColor={DEFAULT_FIELD_THEME.defaultMarcher.label}
                    onBlur={(color: RgbaColor) =>
                        updateFieldProperties(
                            new FieldProperties({
                                ...currentFieldProperties,
                                theme: {
                                    ...currentFieldProperties.theme,
                                    defaultMarcher: {
                                        ...currentFieldProperties.theme
                                            .defaultMarcher,
                                        label: color,
                                    },
                                },
                            }),
                        )
                    }
                />
                <ColorPicker
                    label={t("fieldProperties.labels.shapes")}
                    initialColor={currentFieldProperties.theme.shape}
                    defaultColor={DEFAULT_FIELD_THEME.shape as RgbaColor}
                    onBlur={(color: RgbaColor) => {
                        validateIsRgbaColor("shape", currentFieldProperties);
                        updateFieldProperties(
                            new FieldProperties({
                                ...currentFieldProperties,
                                theme: {
                                    ...currentFieldProperties.theme,
                                    shape: color,
                                },
                            }),
                        );
                    }}
                />
                <StaticFormField label={t("fieldProperties.labels.shapeType")}>
                    <div className="flex items-center gap-8">
                        <Select
                            value={
                                currentFieldProperties.theme.shapeType ??
                                "__none__"
                            }
                            onValueChange={(value) => {
                                const shapeType: ShapeType =
                                    value === "__none__"
                                        ? null
                                        : (value as ShapeType);
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        theme: {
                                            ...currentFieldProperties.theme,
                                            shapeType,
                                        },
                                    }),
                                );
                            }}
                        >
                            <SelectTriggerButton
                                className={inputClassname}
                                label={t("fieldProperties.labels.shapeType")}
                            >
                                {currentFieldProperties.theme.shapeType
                                    ? shapeIcons[
                                          currentFieldProperties.theme
                                              .shapeType as (typeof shapeOptions)[number]
                                      ]
                                    : shapeIcons["circle"]}
                            </SelectTriggerButton>
                            <SelectContent>
                                <SelectGroup>
                                    {shapeOptions.map((shape) => (
                                        <SelectItem key={shape} value={shape}>
                                            {shapeIcons[shape]}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Button
                            tooltipSide="right"
                            size="compact"
                            tooltipText={t(
                                "fieldProperties.tooltips.resetToDefault",
                            )}
                            variant="secondary"
                            onClick={() => {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        theme: {
                                            ...currentFieldProperties.theme,
                                            shapeType: "circle",
                                        },
                                    }),
                                );
                            }}
                            className="rounded-6 h-full"
                            content="icon"
                        >
                            <ArrowUUpLeftIcon size={20} />
                        </Button>
                    </div>
                </StaticFormField>

                <Button
                    onClick={() =>
                        updateFieldProperties(
                            new FieldProperties({
                                ...currentFieldProperties,
                                theme: DEFAULT_FIELD_THEME,
                            }),
                        )
                    }
                    disabled={isPending}
                    variant="secondary"
                    size="compact"
                    className="w-full px-16"
                    tooltipSide="right"
                    tooltipText={t("fieldProperties.tooltips.resetTheme")}
                >
                    <T keyName="fieldProperties.buttons.resetTheme" />
                </Button>
            </div>
        </TabContent>
    );
}
