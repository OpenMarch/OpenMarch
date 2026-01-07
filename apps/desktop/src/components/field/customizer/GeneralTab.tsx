import { FieldProperties, MeasurementSystem } from "@openmarch/core";
import { Input, UnitInput, TabContent, Switch } from "@openmarch/ui";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import clsx from "clsx";
import FormField from "../../ui/FormField";
import { GeneralTabProps } from "./types";
import { inputClassname } from "./utils";

export function GeneralTab({
    currentFieldProperties,
    updateFieldProperties,
    fieldProperties,
    measurementSystem,
    stepSizeInputRef,
    blurOnEnter,
}: GeneralTabProps) {
    const { t } = useTolgee();

    return (
        <TabContent value="general" className="flex flex-col gap-32">
            {/* -------------------------------------------- GENERAL -------------------------------------------- */}
            <div className="flex flex-col gap-12">
                <h4 className="text-h4 mb-8">
                    <T keyName="fieldProperties.sections.general" />
                </h4>
                <FormField
                    label={t("fieldProperties.labels.fieldName")}
                    tooltip={t("fieldProperties.tooltips.fieldName")}
                >
                    <Input
                        type="text"
                        onBlur={(e) => {
                            e.preventDefault();
                            if (
                                e.target.value !== currentFieldProperties.name
                            ) {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        name: e.target.value,
                                    }),
                                );
                            }
                        }}
                        className={inputClassname}
                        onKeyDown={blurOnEnter}
                        defaultValue={currentFieldProperties.name}
                        required
                    />
                </FormField>
                <FormField
                    label={t("fieldProperties.labels.stepSize")}
                    tooltip={t("fieldProperties.tooltips.stepSize")}
                >
                    <UnitInput
                        type="text"
                        ref={stepSizeInputRef}
                        inputMode="numeric"
                        pattern="[0-9]*\.?[0-9]*"
                        containerClassName={inputClassname}
                        unit={measurementSystem === "imperial" ? "in" : "cm"}
                        onBlur={(e) => {
                            e.preventDefault();

                            if (e.target.value !== "") {
                                const parsedFloat = parseFloat(e.target.value);

                                if (!isNaN(parsedFloat)) {
                                    updateFieldProperties(
                                        new FieldProperties({
                                            ...currentFieldProperties,
                                            stepSizeInches:
                                                measurementSystem === "imperial"
                                                    ? parsedFloat
                                                    : FieldProperties.centimetersToInches(
                                                          parsedFloat,
                                                      ),
                                        }),
                                    );
                                }
                            }
                        }}
                        onChange={(e) => {
                            // Allow numbers and decimal point
                            const filtered = e.target.value.replace(
                                /[^\d.]/g,
                                "",
                            );
                            // Ensure only one decimal point
                            const normalized = filtered.replace(/\.+/g, ".");
                            e.target.value = normalized;
                        }}
                        onKeyDown={blurOnEnter}
                        defaultValue={currentFieldProperties.stepSizeInUnits}
                        required
                    />
                </FormField>
                <FormField
                    label={t("fieldProperties.labels.measurementSystem")}
                    tooltip={t("fieldProperties.tooltips.measurementSystem")}
                >
                    <Select
                        onValueChange={(e) => {
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    measurementSystem: e as MeasurementSystem,
                                }),
                            );
                        }}
                        defaultValue={currentFieldProperties.measurementSystem}
                    >
                        <SelectTriggerButton
                            className={inputClassname}
                            label={fieldProperties?.name || "Field type"}
                        />
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="imperial">
                                    <T keyName="fieldProperties.options.imperial" />
                                </SelectItem>
                                <SelectItem value="metric">
                                    <T keyName="fieldProperties.options.metric" />
                                </SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </FormField>

                <FormField
                    label={t("fieldProperties.labels.halfLineXInterval")}
                    tooltip={t("fieldProperties.tooltips.halfLineXInterval")}
                >
                    <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*\.?[0-9]*"
                        className={inputClassname}
                        onBlur={(e) => {
                            e.preventDefault();

                            if (e.target.value === "") {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        halfLineXInterval: undefined,
                                    }),
                                );
                            } else {
                                const parsedFloat = parseFloat(e.target.value);

                                if (!isNaN(parsedFloat)) {
                                    updateFieldProperties(
                                        new FieldProperties({
                                            ...currentFieldProperties,
                                            halfLineXInterval: parsedFloat,
                                        }),
                                    );
                                }
                            }
                        }}
                        onChange={(e) => {
                            // Allow numbers and decimal point
                            const filtered = e.target.value.replace(
                                /[^\d.]/g,
                                "",
                            );
                            // Ensure only one decimal point
                            const normalized = filtered.replace(/\.+/g, ".");
                            e.target.value = normalized;
                        }}
                        onKeyDown={blurOnEnter}
                        defaultValue={fieldProperties?.halfLineXInterval ?? ""}
                    />
                </FormField>
                <FormField
                    label={t("fieldProperties.labels.halfLineYInterval")}
                    tooltip={t("fieldProperties.tooltips.halfLineYInterval")}
                >
                    <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*\.?[0-9]*"
                        className={inputClassname}
                        onBlur={(e) => {
                            e.preventDefault();

                            if (e.target.value === "") {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        halfLineYInterval: undefined,
                                    }),
                                );
                            } else {
                                const parsedFloat = parseFloat(e.target.value);

                                if (!isNaN(parsedFloat)) {
                                    updateFieldProperties(
                                        new FieldProperties({
                                            ...currentFieldProperties,
                                            halfLineYInterval: parsedFloat,
                                        }),
                                    );
                                }
                            }
                        }}
                        onChange={(e) => {
                            // Allow numbers and decimal point
                            const filtered = e.target.value.replace(
                                /[^\d.]/g,
                                "",
                            );
                            // Ensure only one decimal point
                            const normalized = filtered.replace(/\.+/g, ".");
                            e.target.value = normalized;
                        }}
                        onKeyDown={blurOnEnter}
                        defaultValue={fieldProperties?.halfLineYInterval ?? ""}
                    />
                </FormField>
            </div>

            <div className="flex flex-col gap-12">
                <h4 className="text-h4 mb-8">
                    <T keyName="fieldProperties.sections.sideDescriptions" />
                </h4>
                <FormField
                    label={t("fieldProperties.labels.directorsLeft")}
                    tooltip={t("fieldProperties.tooltips.directorsLeft")}
                >
                    <Input
                        type="text"
                        onBlur={(e) => {
                            e.preventDefault();
                            if (
                                e.target.value !==
                                currentFieldProperties.sideDescriptions
                                    .verboseLeft
                            ) {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        sideDescriptions: {
                                            ...currentFieldProperties.sideDescriptions,
                                            verboseLeft: e.target.value,
                                        },
                                    }),
                                );
                            }
                        }}
                        className={inputClassname}
                        onKeyDown={blurOnEnter}
                        defaultValue={
                            currentFieldProperties.sideDescriptions.verboseLeft
                        }
                        required
                    />
                </FormField>
                <FormField
                    label={t("fieldProperties.labels.leftAbbreviation")}
                    tooltip={t("fieldProperties.tooltips.leftAbbreviation")}
                >
                    <Input
                        type="text"
                        onBlur={(e) => {
                            e.preventDefault();
                            if (
                                e.target.value !==
                                currentFieldProperties.sideDescriptions
                                    .terseLeft
                            ) {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        sideDescriptions: {
                                            ...currentFieldProperties.sideDescriptions,
                                            terseLeft: e.target.value,
                                        },
                                    }),
                                );
                            }
                        }}
                        className={inputClassname}
                        onKeyDown={blurOnEnter}
                        defaultValue={
                            currentFieldProperties.sideDescriptions.terseLeft
                        }
                        required
                    />
                </FormField>

                <FormField
                    label={t("fieldProperties.labels.directorsRight")}
                    tooltip={t("fieldProperties.tooltips.directorsRight")}
                >
                    <Input
                        type="text"
                        onBlur={(e) => {
                            e.preventDefault();
                            if (
                                e.target.value !==
                                currentFieldProperties.sideDescriptions
                                    .verboseRight
                            ) {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        sideDescriptions: {
                                            ...currentFieldProperties.sideDescriptions,
                                            verboseRight: e.target.value,
                                        },
                                    }),
                                );
                            }
                        }}
                        className={inputClassname}
                        onKeyDown={blurOnEnter}
                        defaultValue={
                            currentFieldProperties.sideDescriptions.verboseRight
                        }
                        required
                    />
                </FormField>
                <FormField
                    label={t("fieldProperties.labels.rightAbbreviation")}
                    tooltip={t("fieldProperties.tooltips.rightAbbreviation")}
                >
                    <Input
                        type="text"
                        onBlur={(e) => {
                            e.preventDefault();
                            if (
                                e.target.value !==
                                currentFieldProperties.sideDescriptions
                                    .terseRight
                            ) {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        sideDescriptions: {
                                            ...currentFieldProperties.sideDescriptions,
                                            terseRight: e.target.value,
                                        },
                                    }),
                                );
                            }
                        }}
                        className={inputClassname}
                        onKeyDown={blurOnEnter}
                        defaultValue={
                            currentFieldProperties.sideDescriptions.terseRight
                        }
                        required
                    />
                </FormField>
            </div>
            <div className="flex flex-col gap-12">
                <h4 className="text-h4 mb-8">
                    <T keyName="fieldProperties.sections.fieldLabels" />
                </h4>
                <FormField
                    label={t(
                        "fieldProperties.labels.stepsFromFrontToHomeLabel",
                    )}
                    tooltip={t(
                        "fieldProperties.tooltips.stepsFromFrontToHomeLabel",
                    )}
                >
                    <Input
                        type="text"
                        inputMode="numeric"
                        pattern="-?[0-9]*\.?[0-9]*"
                        className={inputClassname}
                        onBlur={(e) => {
                            e.preventDefault();
                            if (e.target.value === "") {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        yardNumberCoordinates: {
                                            ...currentFieldProperties.yardNumberCoordinates,
                                            homeStepsFromFrontToOutside:
                                                undefined,
                                        },
                                    }),
                                );
                            } else {
                                const parsedFloat = parseFloat(e.target.value);

                                if (!isNaN(parsedFloat)) {
                                    updateFieldProperties(
                                        new FieldProperties({
                                            ...currentFieldProperties,
                                            yardNumberCoordinates: {
                                                ...currentFieldProperties.yardNumberCoordinates,
                                                homeStepsFromFrontToOutside:
                                                    parsedFloat,
                                            },
                                        }),
                                    );
                                }
                            }
                        }}
                        onChange={(e) => {
                            // Allow numbers, decimal point, and negative sign
                            const filtered = e.target.value.replace(
                                /[^\d.-]/g,
                                "",
                            );

                            // Ensure only one decimal point and one negative sign at start
                            const normalized = filtered
                                .replace(/\.+/g, ".")
                                .replace(/--+/g, "-")
                                .replace(/(.+)-/g, "$1");

                            e.target.value = normalized;
                        }}
                        onKeyDown={blurOnEnter}
                        defaultValue={
                            fieldProperties?.yardNumberCoordinates
                                .homeStepsFromFrontToOutside ?? ""
                        }
                        disabled
                    />
                </FormField>
                <FormField
                    label={t(
                        "fieldProperties.labels.stepsFromFrontToHomeLabelTop",
                    )}
                    tooltip={t(
                        "fieldProperties.tooltips.stepsFromFrontToHomeLabelTop",
                    )}
                >
                    <Input
                        type="text"
                        inputMode="numeric"
                        pattern="-?[0-9]*\.?[0-9]*"
                        className={inputClassname}
                        onBlur={(e) => {
                            e.preventDefault();
                            if (e.target.value === "") {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        yardNumberCoordinates: {
                                            ...currentFieldProperties.yardNumberCoordinates,
                                            homeStepsFromFrontToInside:
                                                undefined,
                                        },
                                    }),
                                );
                            } else {
                                const parsedFloat = parseFloat(e.target.value);

                                if (!isNaN(parsedFloat)) {
                                    updateFieldProperties(
                                        new FieldProperties({
                                            ...currentFieldProperties,
                                            yardNumberCoordinates: {
                                                ...currentFieldProperties.yardNumberCoordinates,
                                                homeStepsFromFrontToInside:
                                                    parsedFloat,
                                            },
                                        }),
                                    );
                                }
                            }
                        }}
                        onChange={(e) => {
                            // Allow numbers, decimal point, and negative sign
                            const filtered = e.target.value.replace(
                                /[^\d.-]/g,
                                "",
                            );

                            // Ensure only one decimal point and one negative sign at start
                            const normalized = filtered
                                .replace(/\.+/g, ".")
                                .replace(/--+/g, "-")
                                .replace(/(.+)-/g, "$1");

                            e.target.value = normalized;
                        }}
                        onKeyDown={blurOnEnter}
                        defaultValue={
                            fieldProperties?.yardNumberCoordinates
                                .homeStepsFromFrontToInside ?? ""
                        }
                        disabled
                    />
                </FormField>
                <FormField
                    label={t(
                        "fieldProperties.labels.stepsFromFrontToAwayLabelTop",
                    )}
                    tooltip={t(
                        "fieldProperties.tooltips.stepsFromFrontToAwayLabelTop",
                    )}
                >
                    <Input
                        type="text"
                        inputMode="numeric"
                        pattern="-?[0-9]*\.?[0-9]*"
                        className={inputClassname}
                        onBlur={(e) => {
                            e.preventDefault();
                            if (e.target.value === "") {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        yardNumberCoordinates: {
                                            ...currentFieldProperties.yardNumberCoordinates,
                                            awayStepsFromFrontToInside:
                                                undefined,
                                        },
                                    }),
                                );
                            } else {
                                const parsedFloat = parseFloat(e.target.value);

                                if (!isNaN(parsedFloat)) {
                                    updateFieldProperties(
                                        new FieldProperties({
                                            ...currentFieldProperties,
                                            yardNumberCoordinates: {
                                                ...currentFieldProperties.yardNumberCoordinates,
                                                awayStepsFromFrontToInside:
                                                    parsedFloat,
                                            },
                                        }),
                                    );
                                }
                            }
                        }}
                        onChange={(e) => {
                            // Allow numbers, decimal point, and negative sign
                            const filtered = e.target.value.replace(
                                /[^\d.-]/g,
                                "",
                            );

                            // Ensure only one decimal point and one negative sign at start
                            const normalized = filtered
                                .replace(/\.+/g, ".")
                                .replace(/--+/g, "-")
                                .replace(/(.+)-/g, "$1");

                            e.target.value = normalized;
                        }}
                        onKeyDown={blurOnEnter}
                        defaultValue={
                            fieldProperties?.yardNumberCoordinates
                                .awayStepsFromFrontToInside ?? ""
                        }
                        disabled
                    />
                </FormField>
                <FormField
                    label={t(
                        "fieldProperties.labels.stepsFromFrontToAwayLabelBottom",
                    )}
                    tooltip={t(
                        "fieldProperties.tooltips.stepsFromFrontToAwayLabelBottom",
                    )}
                >
                    <Input
                        type="text"
                        inputMode="numeric"
                        pattern="-?[0-9]*\.?[0-9]*"
                        className={inputClassname}
                        onBlur={(e) => {
                            e.preventDefault();
                            if (e.target.value === "") {
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        yardNumberCoordinates: {
                                            ...currentFieldProperties.yardNumberCoordinates,
                                            awayStepsFromFrontToOutside:
                                                undefined,
                                        },
                                    }),
                                );
                            } else {
                                const parsedFloat = parseFloat(e.target.value);

                                if (!isNaN(parsedFloat)) {
                                    updateFieldProperties(
                                        new FieldProperties({
                                            ...currentFieldProperties,
                                            yardNumberCoordinates: {
                                                ...currentFieldProperties.yardNumberCoordinates,
                                                awayStepsFromFrontToOutside:
                                                    parsedFloat,
                                            },
                                        }),
                                    );
                                }
                            }
                        }}
                        onChange={(e) => {
                            // Allow numbers, decimal point, and negative sign
                            const filtered = e.target.value.replace(
                                /[^\d.-]/g,
                                "",
                            );

                            // Ensure only one decimal point and one negative sign at start
                            const normalized = filtered
                                .replace(/\.+/g, ".")
                                .replace(/--+/g, "-")
                                .replace(/(.+)-/g, "$1");

                            e.target.value = normalized;
                        }}
                        onKeyDown={blurOnEnter}
                        defaultValue={
                            fieldProperties?.yardNumberCoordinates
                                .awayStepsFromFrontToOutside ?? ""
                        }
                        disabled
                    />
                </FormField>
            </div>
            <div className="flex flex-col gap-12">
                <h4 className="text-h4 mb-8">
                    <T keyName="fieldProperties.sections.externalLabels" />
                </h4>
                <div className="grid grid-cols-4">
                    <FormField label={t("fieldProperties.labels.left")}>
                        <Switch
                            className={clsx(inputClassname, "col-span-2")}
                            checked={currentFieldProperties.leftLabelsVisible}
                            onClick={(e) => {
                                e.preventDefault();
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        leftLabelsVisible:
                                            !currentFieldProperties.leftLabelsVisible,
                                    }),
                                );
                            }}
                        />
                    </FormField>
                    <FormField label={t("fieldProperties.labels.right")}>
                        <Switch
                            className={clsx(inputClassname, "col-span-2")}
                            checked={currentFieldProperties.rightLabelsVisible}
                            onClick={(e) => {
                                e.preventDefault();
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        rightLabelsVisible:
                                            !currentFieldProperties.rightLabelsVisible,
                                    }),
                                );
                            }}
                        />
                    </FormField>
                    <FormField label={t("fieldProperties.labels.bottom")}>
                        <Switch
                            className={inputClassname}
                            checked={currentFieldProperties.bottomLabelsVisible}
                            onClick={(e) => {
                                e.preventDefault();
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        bottomLabelsVisible:
                                            !currentFieldProperties.bottomLabelsVisible,
                                    }),
                                );
                            }}
                        />
                    </FormField>
                    <FormField label={t("fieldProperties.labels.top")}>
                        <Switch
                            className={inputClassname}
                            checked={currentFieldProperties.topLabelsVisible}
                            onClick={(e) => {
                                e.preventDefault();
                                updateFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        topLabelsVisible:
                                            !currentFieldProperties.topLabelsVisible,
                                    }),
                                );
                            }}
                        />
                    </FormField>
                </div>
            </div>
        </TabContent>
    );
}
