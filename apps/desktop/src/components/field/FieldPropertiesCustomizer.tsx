import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldProperties, {
    Checkpoint,
    MeasurementSystem,
} from "@/global/classes/FieldProperties";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import * as Form from "@radix-ui/react-form";
import {
    Input,
    Button,
    Switch,
    UnitInput,
    Tabs,
    TabsList,
    TabItem,
    TabContent,
} from "@openmarch/ui";
import clsx from "clsx";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { RgbaColor } from "@uiw/react-color";
import { DEFAULT_FIELD_THEME, FieldTheme } from "@/global/classes/FieldTheme";
import ColorPicker from "../ui/ColorPicker";
import FormField from "../ui/FormField";
import { T, useTolgee } from "@tolgee/react";

const defaultFieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

const inputClassname = clsx("col-span-6 self-center ");

const blurOnEnterFunc = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
        e.currentTarget.blur();
    }
};

function CheckpointEditor({
    checkpoint,
    updateCheckpoint,
    deleteCheckpoint,
    axis,
}: {
    checkpoint: Checkpoint;
    deleteCheckpoint: (checkpoint: Checkpoint) => void;
    updateCheckpoint: (args: {
        oldCheckpoint: Checkpoint;
        newCheckpoint: Checkpoint;
        axis: "x" | "y";
    }) => void;
    axis: "x" | "y";
}) {
    const [open, setOpen] = useState(false);

    /**
     * A callback function that blurs the current input element when the "Enter" key is pressed.
     * This is used to handle the behavior of the input field when the user presses the "Enter" key,
     * ensuring that the focus is removed from the input.
     **/
    const blurOnEnter = useCallback(blurOnEnterFunc, []);

    return (
        <RadixCollapsible.Root
            className="CollapsibleRoot"
            open={open}
            onOpenChange={setOpen}
        >
            <RadixCollapsible.Trigger className="border-stroke focus-visible:text-accent rounded-6 bg-fg-2 flex w-full items-center justify-between gap-8 border px-16 py-6 duration-150 ease-out">
                <div className="flex w-full justify-between">
                    <p className="text-text text-body">{checkpoint.name}</p>
                    <p className="text-text/80 text-body">
                        {checkpoint.stepsFromCenterFront} steps
                    </p>
                </div>
                {open ? <CaretUpIcon size={20} /> : <CaretDownIcon size={20} />}
            </RadixCollapsible.Trigger>
            <RadixCollapsible.Content className="bg-fg-2 border-stroke rounded-6 mt-6 border p-8 pt-16">
                <div className="flex flex-col gap-12">
                    <FormField
                        label={`Steps from ${axis === "x" ? " center" : " front"}`}
                        tooltip="The number of steps away from the front
                of the field that this checkpoint is.
                Negative is towards the back."
                    >
                        <Input
                            type="text" // Changed from "number"
                            inputMode="numeric" // Better mobile experience
                            pattern="-?[0-9]*" // Ensures only numbers can be entered
                            className={inputClassname}
                            onBlur={(e) => {
                                e.preventDefault();
                                const parsedInt = parseInt(e.target.value);

                                if (!isNaN(parsedInt)) {
                                    updateCheckpoint({
                                        axis,
                                        oldCheckpoint: checkpoint,
                                        newCheckpoint: {
                                            ...checkpoint,
                                            stepsFromCenterFront: parseInt(
                                                e.target.value,
                                            ),
                                        },
                                    });
                                }
                            }}
                            onChange={(e) => {
                                // Only allow numbers and negative sign
                                const filtered = e.target.value.replace(
                                    /[^\d-]/g,
                                    "",
                                );
                                // Ensure only one negative sign at start
                                const normalized = filtered
                                    .replace(/--+/g, "-")
                                    .replace(/(.+)-/g, "$1");
                                e.target.value = normalized;
                            }}
                            onKeyDown={blurOnEnter}
                            defaultValue={checkpoint.stepsFromCenterFront}
                            required
                            maxLength={10}
                        />
                    </FormField>
                    <FormField
                        label="Name"
                        tooltip="Name your checkpoint whatever you want. This is just for you to know what checkpoint you're selecting."
                    >
                        <Input
                            type="text"
                            onBlur={(e) => {
                                e.preventDefault();
                                updateCheckpoint({
                                    axis,
                                    oldCheckpoint: checkpoint,
                                    newCheckpoint: {
                                        ...checkpoint,
                                        name: e.target.value,
                                    },
                                });
                            }}
                            onKeyDown={blurOnEnter}
                            defaultValue={checkpoint.name}
                            required
                            maxLength={40}
                            className={inputClassname}
                        />
                    </FormField>
                    <FormField
                        label="Short Name"
                        tooltip='The primary name of the checkpoint. (E.g.
                        "45 Yard Line - Side 1")'
                    >
                        <Input
                            type="text" // Changed from "number"
                            onBlur={(e) => {
                                e.preventDefault();
                                if (e.target.value !== checkpoint.terseName) {
                                    updateCheckpoint({
                                        axis,
                                        oldCheckpoint: checkpoint,
                                        newCheckpoint: {
                                            ...checkpoint,
                                            terseName: e.target.value,
                                        },
                                    });
                                }
                            }}
                            className={inputClassname}
                            onKeyDown={blurOnEnter}
                            defaultValue={checkpoint.terseName}
                            required
                        />
                    </FormField>
                    {axis === "x" && (
                        <FormField
                            label="Field label"
                            tooltip="
                            The label to appear on the field. I.e.
                            the yard markers"
                        >
                            <Input
                                type="text" // Changed from "number"
                                onBlur={(e) => {
                                    e.preventDefault();
                                    if (
                                        e.target.value !== checkpoint.fieldLabel
                                    ) {
                                        updateCheckpoint({
                                            axis,
                                            oldCheckpoint: checkpoint,
                                            newCheckpoint: {
                                                ...checkpoint,
                                                fieldLabel:
                                                    e.target.value.length === 0
                                                        ? undefined
                                                        : e.target.value,
                                            },
                                        });
                                    }
                                }}
                                className={inputClassname}
                                onKeyDown={blurOnEnter}
                                defaultValue={checkpoint.fieldLabel ?? ""}
                            />
                        </FormField>
                    )}
                    <FormField
                        label="Visible"
                        tooltip=" If this checkpoint should be visible on the
                        field"
                    >
                        <Switch
                            className={inputClassname}
                            checked={checkpoint.visible}
                            onClick={(e) => {
                                e.preventDefault();
                                updateCheckpoint({
                                    axis,
                                    oldCheckpoint: checkpoint,
                                    newCheckpoint: {
                                        ...checkpoint,
                                        visible: !checkpoint.visible,
                                    },
                                });
                            }}
                        />
                    </FormField>
                    <FormField
                        label="Use as reference"
                        tooltip=" If this checkpoint should be used as a
                        reference for coordinates."
                    >
                        <Switch
                            className={inputClassname}
                            checked={checkpoint.useAsReference}
                            onClick={(e) => {
                                e.preventDefault();
                                updateCheckpoint({
                                    axis,
                                    oldCheckpoint: checkpoint,
                                    newCheckpoint: {
                                        ...checkpoint,
                                        useAsReference:
                                            !checkpoint.useAsReference,
                                    },
                                });
                            }}
                        />
                    </FormField>
                    <Button
                        variant="red"
                        size="compact"
                        className="mx-12 mt-6 mb-8 self-end"
                        tooltipText="Delete this checkpoint from the field"
                        tooltipSide="right"
                        type="button"
                        onClick={() => {
                            deleteCheckpoint(checkpoint);
                        }}
                    >
                        Delete
                    </Button>
                </div>
            </RadixCollapsible.Content>
        </RadixCollapsible.Root>
    );
}

export default function FieldPropertiesCustomizer() {
    const { t } = useTolgee();
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;
    const [currentFieldProperties, setCurrentFieldProperties] =
        useState<FieldProperties>(fieldProperties ?? defaultFieldProperties);
    const [measurementSystem, setMeasurementSystem] =
        useState<MeasurementSystem>(currentFieldProperties.measurementSystem);
    const stepSizeInputRef = useRef<HTMLInputElement>(null);

    const blurOnEnter = useCallback(blurOnEnterFunc, []);

    const updateCheckpoint = useCallback(
        ({
            oldCheckpoint,
            newCheckpoint,
            axis,
        }: {
            oldCheckpoint: Checkpoint;
            newCheckpoint: Checkpoint;
            axis: "x" | "y";
        }) => {
            let found = false;
            const newCheckpoints = (
                axis === "x"
                    ? currentFieldProperties.xCheckpoints
                    : currentFieldProperties.yCheckpoints
            ).map((checkpoint) => {
                if (!found && checkpoint.id === oldCheckpoint.id) {
                    found = true;
                    return newCheckpoint;
                }
                return checkpoint;
            });
            if (!found) {
                console.error(
                    `Checkpoint with id ${oldCheckpoint.id} not found`,
                );
                return;
            }
            if (axis === "x") {
                setFieldProperties(
                    new FieldProperties({
                        ...currentFieldProperties,
                        xCheckpoints: newCheckpoints,
                    }),
                );
            } else {
                setFieldProperties(
                    new FieldProperties({
                        ...currentFieldProperties,
                        yCheckpoints: newCheckpoints,
                    }),
                );
            }
        },
        [currentFieldProperties, setFieldProperties],
    );

    const deleteCheckpoint = useCallback(
        (checkpoint: Checkpoint) => {
            if (checkpoint.axis === "x") {
                const newCheckpoints =
                    currentFieldProperties.xCheckpoints.filter(
                        (c) => c.id !== checkpoint.id,
                    );
                setFieldProperties(
                    new FieldProperties({
                        ...currentFieldProperties,
                        xCheckpoints: newCheckpoints,
                    }),
                );
            } else {
                const newCheckpoints =
                    currentFieldProperties.yCheckpoints.filter(
                        (c) => c.id !== checkpoint.id,
                    );
                setFieldProperties(
                    new FieldProperties({
                        ...currentFieldProperties,
                        yCheckpoints: newCheckpoints,
                    }),
                );
            }
            toast.success(
                `${checkpoint.axis.toUpperCase()}-checkpoint at ${checkpoint.stepsFromCenterFront} steps deleted - "${checkpoint.name}"`,
            );
        },
        [currentFieldProperties, setFieldProperties],
    );

    const addCheckpoint = useCallback(
        (axis: "x" | "y") => {
            let newSteps: number;
            if (axis === "x") {
                const maxXCheckpointSteps =
                    currentFieldProperties.xCheckpoints.reduce(
                        (max, checkpoint) => {
                            return checkpoint.stepsFromCenterFront > max
                                ? checkpoint.stepsFromCenterFront
                                : max;
                        },
                        0,
                    );
                newSteps = maxXCheckpointSteps;
                const maxXCheckpointId =
                    currentFieldProperties.xCheckpoints.reduce(
                        (max, checkpoint) => {
                            return checkpoint.id > max ? checkpoint.id : max;
                        },
                        0,
                    );
                const newXCheckpoint: Checkpoint = {
                    id: maxXCheckpointId + 1,
                    name: "New X Checkpoint",
                    terseName: "TBD",
                    axis: "x",
                    stepsFromCenterFront: maxXCheckpointSteps,
                    useAsReference: true,
                    visible: true,
                };
                setFieldProperties(
                    new FieldProperties({
                        ...currentFieldProperties,
                        xCheckpoints: [
                            ...currentFieldProperties.xCheckpoints,
                            newXCheckpoint,
                        ].sort(sorter),
                    }),
                );
            } else {
                const maxYCheckpointId =
                    currentFieldProperties.yCheckpoints.reduce(
                        (max, checkpoint) => {
                            return checkpoint.id > max ? checkpoint.id : max;
                        },
                        0,
                    );
                const maxYCheckpointSteps =
                    currentFieldProperties.yCheckpoints.reduce(
                        (max, checkpoint) => {
                            return checkpoint.stepsFromCenterFront > max
                                ? checkpoint.stepsFromCenterFront
                                : max;
                        },
                        0,
                    );
                newSteps = maxYCheckpointSteps;
                const newYCheckpoint: Checkpoint = {
                    id: maxYCheckpointId + 1,
                    name: "New Y Checkpoint",
                    terseName: "TBD",
                    axis: "y",
                    stepsFromCenterFront: maxYCheckpointSteps,
                    useAsReference: true,
                    visible: true,
                };
                setFieldProperties(
                    new FieldProperties({
                        ...currentFieldProperties,
                        yCheckpoints: [
                            ...currentFieldProperties.yCheckpoints,
                            newYCheckpoint,
                        ].sort(sorter),
                    }),
                );
            }
            toast.success(
                `${axis.toUpperCase()}-checkpoint at ${newSteps} steps created`,
            );
        },
        [currentFieldProperties, setFieldProperties],
    );

    const sorter = (a: Checkpoint, b: Checkpoint) => {
        if (a.stepsFromCenterFront < b.stepsFromCenterFront) {
            return -1;
        }
        if (a.stepsFromCenterFront > b.stepsFromCenterFront) {
            return 1;
        }
        return 0;
    };

    useEffect(() => {
        setCurrentFieldProperties(
            fieldProperties ?? currentFieldProperties ?? defaultFieldProperties,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldProperties]);

    useEffect(() => {
        if (currentFieldProperties.measurementSystem !== measurementSystem) {
            setMeasurementSystem(currentFieldProperties.measurementSystem);
            if (stepSizeInputRef.current) {
                stepSizeInputRef.current.value =
                    currentFieldProperties.stepSizeInUnits.toString();
            }
        }
    }, [
        currentFieldProperties.measurementSystem,
        currentFieldProperties.stepSizeInUnits,
        measurementSystem,
    ]);

    // Helper function to validate RGBA colors
    const validateIsRgbaColor = (
        themeProperty: keyof FieldTheme,
        fieldProperties: FieldProperties,
    ) => {
        const color = fieldProperties.theme[themeProperty] as RgbaColor;
        const isRgba =
            color.r !== undefined &&
            color.g !== undefined &&
            color.b !== undefined &&
            color.a !== undefined;
        if (!isRgba) {
            toast.error("Invalid color");
            return false;
        }
        return true;
    };

    return (
        <Form.Root
            onSubmit={(e) => e.preventDefault()}
            className="mb-16 flex w-[34rem] flex-col gap-16"
        >
            <h4 className="text-h4">
                <T keyName="fieldProperties.title" />
            </h4>
            <Tabs defaultValue="general">
                <TabsList>
                    <TabItem value="general">
                        <T keyName="fieldProperties.tabs.general" />
                    </TabItem>
                    <TabItem value="checkpoints">
                        <T keyName="fieldProperties.tabs.checkpoints" />
                    </TabItem>
                    <TabItem value="image">
                        <T keyName="fieldProperties.tabs.image" />
                    </TabItem>
                    <TabItem value="theme">
                        <T keyName="fieldProperties.tabs.theme" />
                    </TabItem>
                </TabsList>

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
                                type="text" // Changed from "number"
                                onBlur={(e) => {
                                    e.preventDefault();
                                    if (
                                        e.target.value !==
                                        currentFieldProperties.name
                                    ) {
                                        setFieldProperties(
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
                                // className={inputClassname}
                                unit={
                                    measurementSystem === "imperial"
                                        ? "in"
                                        : "cm"
                                }
                                onBlur={(e) => {
                                    e.preventDefault();

                                    if (e.target.value !== "") {
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties(
                                                new FieldProperties({
                                                    ...currentFieldProperties,
                                                    stepSizeInches:
                                                        measurementSystem ===
                                                        "imperial"
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
                                    const normalized = filtered.replace(
                                        /\.+/g,
                                        ".",
                                    );
                                    e.target.value = normalized;
                                }}
                                onKeyDown={blurOnEnter}
                                defaultValue={
                                    currentFieldProperties.stepSizeInUnits
                                }
                                required
                            />
                        </FormField>
                        <FormField
                            label={t(
                                "fieldProperties.labels.measurementSystem",
                            )}
                            tooltip={t(
                                "fieldProperties.tooltips.measurementSystem",
                            )}
                        >
                            <Select
                                onValueChange={(e) => {
                                    setFieldProperties(
                                        new FieldProperties({
                                            ...currentFieldProperties,
                                            measurementSystem:
                                                e as MeasurementSystem,
                                        }),
                                    );
                                }}
                                defaultValue={
                                    currentFieldProperties.measurementSystem
                                }
                            >
                                <SelectTriggerButton
                                    className={inputClassname}
                                    label={
                                        fieldProperties?.name || "Field type"
                                    }
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
                            label={t(
                                "fieldProperties.labels.halfLineXInterval",
                            )}
                            tooltip={t(
                                "fieldProperties.tooltips.halfLineXInterval",
                            )}
                        >
                            <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*\.?[0-9]*"
                                className={inputClassname}
                                onBlur={(e) => {
                                    e.preventDefault();

                                    if (e.target.value === "") {
                                        setFieldProperties(
                                            new FieldProperties({
                                                ...currentFieldProperties,
                                                halfLineXInterval: undefined,
                                            }),
                                        );
                                    } else {
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties(
                                                new FieldProperties({
                                                    ...currentFieldProperties,
                                                    halfLineXInterval:
                                                        parsedFloat,
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
                                    const normalized = filtered.replace(
                                        /\.+/g,
                                        ".",
                                    );
                                    e.target.value = normalized;
                                }}
                                onKeyDown={blurOnEnter}
                                defaultValue={
                                    fieldProperties?.halfLineXInterval ?? ""
                                }
                            />
                        </FormField>
                        <FormField
                            label={t(
                                "fieldProperties.labels.halfLineYInterval",
                            )}
                            tooltip={t(
                                "fieldProperties.tooltips.halfLineYInterval",
                            )}
                        >
                            <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*\.?[0-9]*"
                                className={inputClassname}
                                onBlur={(e) => {
                                    e.preventDefault();

                                    if (e.target.value === "") {
                                        setFieldProperties(
                                            new FieldProperties({
                                                ...currentFieldProperties,
                                                halfLineYInterval: undefined,
                                            }),
                                        );
                                    } else {
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties(
                                                new FieldProperties({
                                                    ...currentFieldProperties,
                                                    halfLineYInterval:
                                                        parsedFloat,
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
                                    const normalized = filtered.replace(
                                        /\.+/g,
                                        ".",
                                    );
                                    e.target.value = normalized;
                                }}
                                onKeyDown={blurOnEnter}
                                defaultValue={
                                    fieldProperties?.halfLineYInterval ?? ""
                                }
                            />
                        </FormField>
                    </div>

                    <div className="flex flex-col gap-12">
                        <h4 className="text-h4 mb-8">
                            <T keyName="fieldProperties.sections.sideDescriptions" />
                        </h4>
                        <FormField
                            label={t("fieldProperties.labels.directorsLeft")}
                            tooltip={t(
                                "fieldProperties.tooltips.directorsLeft",
                            )}
                        >
                            <Input
                                type="text" // Changed from "number"
                                onBlur={(e) => {
                                    e.preventDefault();
                                    if (
                                        e.target.value !==
                                        currentFieldProperties.sideDescriptions
                                            .verboseLeft
                                    ) {
                                        setFieldProperties(
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
                                    currentFieldProperties.sideDescriptions
                                        .verboseLeft
                                }
                                required
                            />
                        </FormField>
                        <FormField
                            label={t("fieldProperties.labels.leftAbbreviation")}
                            tooltip={t(
                                "fieldProperties.tooltips.leftAbbreviation",
                            )}
                        >
                            <Input
                                type="text" // Changed from "number"
                                onBlur={(e) => {
                                    e.preventDefault();
                                    if (
                                        e.target.value !==
                                        currentFieldProperties.sideDescriptions
                                            .terseLeft
                                    ) {
                                        setFieldProperties(
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
                                    currentFieldProperties.sideDescriptions
                                        .terseLeft
                                }
                                required
                            />
                        </FormField>

                        <FormField
                            label={t("fieldProperties.labels.directorsRight")}
                            tooltip={t(
                                "fieldProperties.tooltips.directorsRight",
                            )}
                        >
                            <Input
                                type="text" // Changed from "number"
                                onBlur={(e) => {
                                    e.preventDefault();
                                    if (
                                        e.target.value !==
                                        currentFieldProperties.sideDescriptions
                                            .verboseRight
                                    ) {
                                        setFieldProperties(
                                            new FieldProperties({
                                                ...currentFieldProperties,
                                                sideDescriptions: {
                                                    ...currentFieldProperties.sideDescriptions,
                                                    verboseRight:
                                                        e.target.value,
                                                },
                                            }),
                                        );
                                    }
                                }}
                                className={inputClassname}
                                onKeyDown={blurOnEnter}
                                defaultValue={
                                    currentFieldProperties.sideDescriptions
                                        .verboseRight
                                }
                                required
                            />
                        </FormField>
                        <FormField
                            label={t(
                                "fieldProperties.labels.rightAbbreviation",
                            )}
                            tooltip={t(
                                "fieldProperties.tooltips.rightAbbreviation",
                            )}
                        >
                            <Input
                                type="text" // Changed from "number"
                                onBlur={(e) => {
                                    e.preventDefault();
                                    if (
                                        e.target.value !==
                                        currentFieldProperties.sideDescriptions
                                            .terseRight
                                    ) {
                                        setFieldProperties(
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
                                    currentFieldProperties.sideDescriptions
                                        .terseRight
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
                                        setFieldProperties(
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
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties(
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
                                        setFieldProperties(
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
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties(
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
                                        setFieldProperties(
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
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties(
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
                                        setFieldProperties(
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
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties(
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
                        {/* <div className="mb-16">Field </div> */}
                        <h4 className="text-h4 mb-8">
                            <T keyName="fieldProperties.sections.externalLabels" />
                        </h4>
                        <div className="grid grid-cols-4">
                            <FormField label={t("fieldProperties.labels.left")}>
                                <Switch
                                    className={clsx(
                                        inputClassname,
                                        "col-span-2",
                                    )}
                                    checked={
                                        currentFieldProperties.leftLabelsVisible
                                    }
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setFieldProperties(
                                            new FieldProperties({
                                                ...currentFieldProperties,
                                                leftLabelsVisible:
                                                    !currentFieldProperties.leftLabelsVisible,
                                            }),
                                        );
                                    }}
                                />
                            </FormField>
                            <FormField
                                label={t("fieldProperties.labels.right")}
                            >
                                <Switch
                                    className={clsx(
                                        inputClassname,
                                        "col-span-2",
                                    )}
                                    checked={
                                        currentFieldProperties.rightLabelsVisible
                                    }
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setFieldProperties(
                                            new FieldProperties({
                                                ...currentFieldProperties,
                                                rightLabelsVisible:
                                                    !currentFieldProperties.rightLabelsVisible,
                                            }),
                                        );
                                    }}
                                />
                            </FormField>
                            <FormField
                                label={t("fieldProperties.labels.bottom")}
                            >
                                <Switch
                                    className={inputClassname}
                                    checked={
                                        currentFieldProperties.bottomLabelsVisible
                                    }
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setFieldProperties(
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
                                    checked={
                                        currentFieldProperties.topLabelsVisible
                                    }
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setFieldProperties(
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

                {/* -------------------------------------------- CHECKPOINTS -------------------------------------------- */}
                <TabContent
                    value="checkpoints"
                    className="flex flex-col gap-32"
                >
                    <div>
                        <h4 className="text-h4 mb-16">
                            <T keyName="fieldProperties.sections.xCheckpoints" />
                        </h4>
                        <div
                            className="rounded-6 bg-red mx-4 my-8 p-6 text-center text-white"
                            hidden={
                                Math.abs(
                                    Math.min(
                                        ...currentFieldProperties.xCheckpoints.map(
                                            (x) => x.stepsFromCenterFront,
                                        ),
                                    ),
                                ) ===
                                Math.abs(
                                    Math.max(
                                        ...currentFieldProperties.xCheckpoints.map(
                                            (x) => x.stepsFromCenterFront,
                                        ),
                                    ),
                                )
                            }
                        >
                            <T keyName="fieldProperties.warnings.xCheckpointsNotEquidistant" />
                        </div>
                        <div className="flex flex-col gap-12">
                            {currentFieldProperties.xCheckpoints
                                .sort(sorter)
                                .map((xCheckpoint) => (
                                    <CheckpointEditor
                                        checkpoint={xCheckpoint}
                                        updateCheckpoint={updateCheckpoint}
                                        key={xCheckpoint.id}
                                        axis="x"
                                        deleteCheckpoint={deleteCheckpoint}
                                    />
                                ))}
                        </div>
                        <div className="mt-16 flex justify-end">
                            <Button
                                onClick={() => addCheckpoint("x")}
                                className="self-end"
                                size="compact"
                                type="button"
                            >
                                <T keyName="fieldProperties.buttons.newXCheckpoint" />
                            </Button>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-h4 mb-16">
                            <T keyName="fieldProperties.sections.yCheckpoints" />
                        </h4>
                        <div
                            className="rounded-6 bg-red mx-4 my-8 p-6 text-center text-white"
                            hidden={
                                Math.max(
                                    ...currentFieldProperties.yCheckpoints.map(
                                        (y) => y.stepsFromCenterFront,
                                    ),
                                ) <= 0
                            }
                        >
                            <T keyName="fieldProperties.warnings.yCheckpointsNegative" />
                        </div>
                        <div className="flex flex-col gap-12">
                            <FormField
                                label={t("fieldProperties.labels.useHashes")}
                                tooltip={t(
                                    "fieldProperties.tooltips.useHashes",
                                )}
                            >
                                <Switch
                                    className={inputClassname}
                                    checked={currentFieldProperties.useHashes}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setFieldProperties(
                                            new FieldProperties({
                                                ...currentFieldProperties,
                                                useHashes:
                                                    !currentFieldProperties.useHashes,
                                            }),
                                        );
                                    }}
                                />
                            </FormField>
                            {currentFieldProperties.yCheckpoints
                                .sort(sorter)
                                .map((yCheckpoint) => (
                                    <CheckpointEditor
                                        checkpoint={yCheckpoint}
                                        updateCheckpoint={updateCheckpoint}
                                        key={yCheckpoint.id}
                                        axis="y"
                                        deleteCheckpoint={deleteCheckpoint}
                                    />
                                ))}
                        </div>
                        <div className="mt-16 mb-16 flex justify-end">
                            <Button
                                onClick={() => addCheckpoint("y")}
                                size="compact"
                                className="self-end"
                                type="button"
                            >
                                <T keyName="fieldProperties.buttons.newYCheckpoint" />
                            </Button>
                        </div>
                    </div>
                </TabContent>

                {/* -------------------------------------------- IMAGE -------------------------------------------- */}
                <TabContent value="image" className="flex flex-col gap-32">
                    <div className="flex flex-col gap-12">
                        <h4 className="text-h4 mb-8">
                            <T keyName="fieldProperties.sections.imageRendering" />
                        </h4>
                        <FormField
                            label={t(
                                "fieldProperties.labels.showBackgroundImage",
                            )}
                        >
                            <Switch
                                className={clsx(inputClassname, "col-span-2")}
                                checked={currentFieldProperties.showFieldImage}
                                onClick={(e) => {
                                    e.preventDefault();
                                    setFieldProperties(
                                        new FieldProperties({
                                            ...currentFieldProperties,
                                            showFieldImage:
                                                !currentFieldProperties.showFieldImage,
                                        }),
                                    );
                                }}
                            />
                        </FormField>
                        <FormField
                            label={t("fieldProperties.labels.conformMethod")}
                            tooltip={t(
                                "fieldProperties.tooltips.conformMethod",
                            )}
                        >
                            <Select
                                onValueChange={(e) => {
                                    const newValue =
                                        e === "fit" || e === "fill" ? e : "fit";
                                    setFieldProperties(
                                        new FieldProperties({
                                            ...currentFieldProperties,
                                            imageFillOrFit: newValue,
                                        }),
                                    );
                                }}
                                defaultValue={
                                    currentFieldProperties.imageFillOrFit
                                }
                            >
                                <SelectTriggerButton
                                    className={inputClassname}
                                    label={t(
                                        "fieldProperties.labels.conformingMethod",
                                    )}
                                />
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="fit">
                                            <T keyName="fieldProperties.options.fit" />
                                        </SelectItem>
                                        <SelectItem value="fill">
                                            <T keyName="fieldProperties.options.fill" />
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </FormField>

                        <div className="flex h-fit min-h-0 items-center gap-8">
                            <Button
                                className="w-full"
                                tooltipText={t(
                                    "fieldProperties.tooltips.importImage",
                                )}
                                tooltipSide="right"
                                variant="primary"
                                type="button"
                                size="compact"
                                onClick={async () => {
                                    await window.electron
                                        .importFieldPropertiesImage()
                                        .then(() =>
                                            setFieldProperties(
                                                new FieldProperties({
                                                    ...currentFieldProperties,
                                                    showFieldImage: true,
                                                }),
                                            ),
                                        );
                                }}
                            >
                                <T keyName="fieldProperties.buttons.importImage" />
                            </Button>
                            <div className="text-sub text-text-subtitle h-fit min-h-0 w-fit leading-none whitespace-nowrap">
                                <T keyName="fieldProperties.messages.refreshAfterImporting" />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-12">
                        <h4 className="text-h4 mb-8">
                            <T keyName="fieldProperties.sections.measurements" />
                        </h4>
                        <div className="flex w-full flex-col gap-4">
                            <div className={clsx("col-span-2 align-middle")}>
                                <T keyName="fieldProperties.labels.width" />
                            </div>
                            <div className="flex w-full gap-8">
                                <div className="bg-fg-2 border-stroke rounded-6 w-full border px-8 py-2 text-center font-mono">
                                    {currentFieldProperties.width /
                                        currentFieldProperties.pixelsPerStep}{" "}
                                    steps
                                </div>
                                <div className="bg-fg-2 border-stroke rounded-6 w-full border px-8 py-2 text-center font-mono">
                                    {currentFieldProperties.prettyWidth}
                                </div>
                            </div>
                        </div>
                        <div className="flex w-full flex-col gap-4">
                            <div className={clsx("col-span-2 align-middle")}>
                                <T keyName="fieldProperties.labels.height" />
                            </div>
                            <div className="flex w-full gap-8">
                                <div className="bg-fg-2 border-stroke rounded-6 w-full border px-8 py-2 text-center font-mono">
                                    {currentFieldProperties.height /
                                        currentFieldProperties.pixelsPerStep}{" "}
                                    steps
                                </div>
                                <div className="bg-fg-2 border-stroke rounded-6 w-full border px-8 py-2 text-center font-mono">
                                    {currentFieldProperties.prettyHeight}
                                </div>
                            </div>
                        </div>
                        <div className="flex w-full flex-col gap-4">
                            <div>
                                <T keyName="fieldProperties.labels.fieldRatio" />
                            </div>
                            <div className="flex w-full gap-8">
                                <div className="bg-fg-2 border-stroke rounded-6 w-full border px-8 py-2 text-center font-mono">
                                    {(() => {
                                        const w = currentFieldProperties.width;
                                        const h = currentFieldProperties.height;
                                        const gcd = (
                                            a: number,
                                            b: number,
                                        ): number => (b ? gcd(b, a % b) : a);
                                        const divisor = gcd(w, h);
                                        const ratioStr = `${w / divisor}:${h / divisor}`;
                                        const divStr = (w / h).toFixed(3);
                                        if (ratioStr.length > 12) {
                                            return divStr;
                                        } else {
                                            return `${ratioStr}  or  ${divStr}`;
                                        }
                                    })()}
                                </div>
                                <div className="bg-fg-2 border-stroke rounded-6 w-fit border px-8 py-2 text-center font-mono">
                                    w/h
                                </div>
                            </div>
                        </div>
                        <div className="flex w-full flex-col gap-4">
                            <div className={clsx("col-span-5 align-middle")}>
                                <T keyName="fieldProperties.labels.backgroundImageRatio" />
                            </div>
                            <div className="flex w-full gap-8">
                                <div className="bg-fg-2 border-stroke rounded-6 w-full border px-8 py-2 text-center font-mono">
                                    {(() => {
                                        if (!FieldProperties.imageDimensions) {
                                            return "N/A";
                                        }
                                        const w =
                                            FieldProperties.imageDimensions
                                                .width;
                                        const h =
                                            FieldProperties.imageDimensions
                                                .height;
                                        const gcd = (
                                            a: number,
                                            b: number,
                                        ): number => (b ? gcd(b, a % b) : a);
                                        const divisor = gcd(w, h);
                                        const ratioStr = `${w / divisor}:${h / divisor}`;
                                        const divStr = (w / h).toFixed(3);
                                        if (ratioStr.length > 12) {
                                            return divStr;
                                        } else {
                                            return `${ratioStr}  or  ${divStr}`;
                                        }
                                    })()}
                                </div>
                                <div className="bg-fg-2 border-stroke rounded-6 w-fit border px-8 py-2 text-center font-mono">
                                    w/h
                                </div>
                            </div>
                        </div>
                        <div className="text-sub text-text mx-16 rounded-full py-4 text-end text-pretty">
                            <T keyName="fieldProperties.messages.measurementModificationNote" />
                        </div>
                    </div>
                </TabContent>

                {/* -------------------------------------------- THEME -------------------------------------------- */}
                <TabContent value="theme" className="flex flex-col gap-32">
                    <div className="flex flex-col gap-12">
                        <h4 className="text-h4 mb-8">
                            <T keyName="fieldProperties.sections.theme" />
                        </h4>
                        <ColorPicker
                            label={t("fieldProperties.labels.background")}
                            initialColor={
                                currentFieldProperties.theme.background
                            }
                            defaultColor={
                                DEFAULT_FIELD_THEME.background as RgbaColor
                            }
                            onChange={(color: RgbaColor) => {
                                validateIsRgbaColor(
                                    "background",
                                    currentFieldProperties,
                                );
                                setFieldProperties(
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
                            initialColor={
                                currentFieldProperties.theme.primaryStroke
                            }
                            defaultColor={
                                DEFAULT_FIELD_THEME.primaryStroke as RgbaColor
                            }
                            onChange={(color: RgbaColor) => {
                                validateIsRgbaColor(
                                    "primaryStroke",
                                    currentFieldProperties,
                                );
                                setFieldProperties(
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
                            initialColor={
                                currentFieldProperties.theme.secondaryStroke
                            }
                            defaultColor={
                                DEFAULT_FIELD_THEME.secondaryStroke as RgbaColor
                            }
                            onChange={(color: RgbaColor) => {
                                validateIsRgbaColor(
                                    "secondaryStroke",
                                    currentFieldProperties,
                                );
                                setFieldProperties(
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
                            initialColor={
                                currentFieldProperties.theme.tertiaryStroke
                            }
                            defaultColor={
                                DEFAULT_FIELD_THEME.tertiaryStroke as RgbaColor
                            }
                            onChange={(color: RgbaColor) => {
                                validateIsRgbaColor(
                                    "tertiaryStroke",
                                    currentFieldProperties,
                                );
                                setFieldProperties(
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
                        <ColorPicker
                            label={t("fieldProperties.labels.fieldLabels")}
                            initialColor={
                                currentFieldProperties.theme.fieldLabel
                            }
                            defaultColor={
                                DEFAULT_FIELD_THEME.fieldLabel as RgbaColor
                            }
                            onChange={(color: RgbaColor) => {
                                validateIsRgbaColor(
                                    "fieldLabel",
                                    currentFieldProperties,
                                );
                                setFieldProperties(
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
                            initialColor={
                                currentFieldProperties.theme.externalLabel
                            }
                            defaultColor={
                                DEFAULT_FIELD_THEME.externalLabel as RgbaColor
                            }
                            onChange={(color: RgbaColor) => {
                                validateIsRgbaColor(
                                    "externalLabel",
                                    currentFieldProperties,
                                );
                                setFieldProperties(
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
                        <ColorPicker
                            label={t("fieldProperties.labels.previousPath")}
                            initialColor={
                                currentFieldProperties.theme.previousPath
                            }
                            defaultColor={
                                DEFAULT_FIELD_THEME.previousPath as RgbaColor
                            }
                            onChange={(color: RgbaColor) => {
                                validateIsRgbaColor(
                                    "previousPath",
                                    currentFieldProperties,
                                );
                                setFieldProperties(
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
                            defaultColor={
                                DEFAULT_FIELD_THEME.nextPath as RgbaColor
                            }
                            onChange={(color: RgbaColor) => {
                                validateIsRgbaColor(
                                    "nextPath",
                                    currentFieldProperties,
                                );
                                setFieldProperties(
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
                        <div className="bg-fg-2 text-text border-stroke rounded-full border py-4 text-center text-[14px]">
                            <T keyName="fieldProperties.messages.refreshNote" />
                        </div>
                        <ColorPicker
                            label={t("fieldProperties.labels.shapes")}
                            initialColor={currentFieldProperties.theme.shape}
                            defaultColor={
                                DEFAULT_FIELD_THEME.shape as RgbaColor
                            }
                            onChange={(color: RgbaColor) => {
                                validateIsRgbaColor(
                                    "shape",
                                    currentFieldProperties,
                                );
                                setFieldProperties(
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
                        <ColorPicker
                            label={t("fieldProperties.labels.temporaryPath")}
                            initialColor={currentFieldProperties.theme.tempPath}
                            defaultColor={
                                DEFAULT_FIELD_THEME.tempPath as RgbaColor
                            }
                            onChange={(color: RgbaColor) => {
                                validateIsRgbaColor(
                                    "tempPath",
                                    currentFieldProperties,
                                );
                                setFieldProperties(
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
                        <ColorPicker
                            label={t("fieldProperties.labels.marcherFill")}
                            initialColor={
                                currentFieldProperties.theme.defaultMarcher.fill
                            }
                            defaultColor={
                                DEFAULT_FIELD_THEME.defaultMarcher.fill
                            }
                            onChange={(color: RgbaColor) =>
                                setFieldProperties(
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
                                currentFieldProperties.theme.defaultMarcher
                                    .outline
                            }
                            defaultColor={
                                DEFAULT_FIELD_THEME.defaultMarcher.outline
                            }
                            onChange={(color: RgbaColor) =>
                                setFieldProperties(
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
                                currentFieldProperties.theme.defaultMarcher
                                    .label
                            }
                            defaultColor={
                                DEFAULT_FIELD_THEME.defaultMarcher.label
                            }
                            onChange={(color: RgbaColor) =>
                                setFieldProperties(
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
                        <Button
                            onClick={() =>
                                setFieldProperties(
                                    new FieldProperties({
                                        ...currentFieldProperties,
                                        theme: DEFAULT_FIELD_THEME,
                                    }),
                                )
                            }
                            variant="secondary"
                            size="compact"
                            className="w-full px-16"
                            tooltipSide="right"
                            tooltipText={t(
                                "fieldProperties.tooltips.resetTheme",
                            )}
                        >
                            <T keyName="fieldProperties.buttons.resetTheme" />
                        </Button>
                    </div>
                </TabContent>
            </Tabs>
        </Form.Root>
    );
}
