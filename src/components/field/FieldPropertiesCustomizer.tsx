import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldProperties, {
    Checkpoint,
    MeasurementSystem,
} from "@/global/classes/FieldProperties";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDown, CaretUp, Info } from "@phosphor-icons/react";
import * as Form from "@radix-ui/react-form";
import { Input } from "../ui/Input";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipContents } from "../ui/Tooltip";
import clsx from "clsx";
import { Switch } from "../ui/Switch";
import { Button } from "../ui/Button";
import { toast } from "sonner";
import { UnitInput } from "../ui/UnitInput";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
} from "../ui/Select";

const defaultFieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

const formFieldClassname = clsx("grid grid-cols-12 gap-8 h-[40px]");
const labelClassname = clsx("text-body text-text/80 self-center col-span-5");
const requiredLabelClassname = clsx(
    labelClassname,
    "after:content-['*'] after:text-red",
);
const inputClassname = clsx("col-span-6 self-center ");
const tooltipClassname = clsx("");
const errorClassname = clsx("text-md leading-none text-red mt-8");

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
            <RadixCollapsible.Trigger className="flex w-full justify-between gap-8 rounded-full border border-stroke px-16 py-6 duration-150 ease-out focus-visible:text-accent">
                <div className="flex w-full justify-between">
                    <div>{checkpoint.name}</div>
                    <div>{checkpoint.stepsFromCenterFront} steps</div>
                </div>
                {open ? <CaretUp size={24} /> : <CaretDown size={24} />}
            </RadixCollapsible.Trigger>
            <RadixCollapsible.Content className={"mx-12 my-8"}>
                <div className="flex flex-col gap-8">
                    <Form.Field name="Steps from center">
                        <div className={formFieldClassname}>
                            <Form.Label className={requiredLabelClassname}>
                                Steps from{axis === "x" ? " center" : " front"}
                            </Form.Label>
                            <Form.Control asChild>
                                <Input
                                    type="text" // Changed from "number"
                                    inputMode="numeric" // Better mobile experience
                                    pattern="-?[0-9]*" // Ensures only numbers can be entered
                                    className={inputClassname}
                                    onBlur={(e) => {
                                        e.preventDefault();
                                        const parsedInt = parseInt(
                                            e.target.value,
                                        );

                                        if (!isNaN(parsedInt)) {
                                            updateCheckpoint({
                                                axis,
                                                oldCheckpoint: checkpoint,
                                                newCheckpoint: {
                                                    ...checkpoint,
                                                    stepsFromCenterFront:
                                                        parseInt(
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
                                    defaultValue={
                                        checkpoint.stepsFromCenterFront
                                    }
                                    required
                                    maxLength={10}
                                />
                            </Form.Control>
                            <Tooltip.TooltipProvider>
                                <Tooltip.Root>
                                    <Tooltip.Trigger
                                        type="button"
                                        className={tooltipClassname}
                                    >
                                        <Info
                                            size={18}
                                            className="text-text/60"
                                        />
                                    </Tooltip.Trigger>
                                    <TooltipContents
                                        className="p-16 text-center"
                                        side="right"
                                    >
                                        The number of steps away from the front
                                        of the field that this checkpoint is.{" "}
                                        <br />
                                        Negative is towards the back.
                                    </TooltipContents>
                                </Tooltip.Root>
                            </Tooltip.TooltipProvider>
                        </div>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>
                    </Form.Field>
                    <Form.Field name="Name">
                        <div className={formFieldClassname}>
                            <Form.Label className={requiredLabelClassname}>
                                Name
                            </Form.Label>
                            <Form.Control asChild>
                                <Input
                                    type="text"
                                    onBlur={(e) => {
                                        e.preventDefault();
                                        if (
                                            e.target.value !== checkpoint.name
                                        ) {
                                            updateCheckpoint({
                                                axis,
                                                oldCheckpoint: checkpoint,
                                                newCheckpoint: {
                                                    ...checkpoint,
                                                    name: e.target.value,
                                                },
                                            });
                                        }
                                    }}
                                    className={inputClassname}
                                    onKeyDown={blurOnEnter}
                                    defaultValue={checkpoint.name}
                                    required
                                />
                            </Form.Control>

                            <Tooltip.TooltipProvider>
                                <Tooltip.Root>
                                    <Tooltip.Trigger
                                        type="button"
                                        className={tooltipClassname}
                                    >
                                        <Info
                                            size={18}
                                            className="text-text/60"
                                        />
                                    </Tooltip.Trigger>
                                    <TooltipContents
                                        className="p-16"
                                        side="right"
                                    >
                                        The primary name of the checkpoint.
                                        (E.g. &quot;45 Yard Line - Side 1&quot;)
                                    </TooltipContents>
                                </Tooltip.Root>
                            </Tooltip.TooltipProvider>
                        </div>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>
                    </Form.Field>
                    <Form.Field
                        name="Short Name"
                        className={formFieldClassname}
                    >
                        <Form.Label className={requiredLabelClassname}>
                            Short Name
                        </Form.Label>
                        <Form.Control asChild>
                            <Input
                                type="text" // Changed from "number"
                                onBlur={(e) => {
                                    e.preventDefault();
                                    if (
                                        e.target.value !== checkpoint.terseName
                                    ) {
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    The primary name of the checkpoint. (E.g.
                                    &quot;45 Yard Line - Side 1&quot;)
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    {axis === "x" && (
                        <Form.Field
                            name="Field label"
                            className={formFieldClassname}
                        >
                            <Form.Label className={labelClassname}>
                                Field label
                            </Form.Label>
                            <Form.Control asChild>
                                <Input
                                    type="text" // Changed from "number"
                                    onBlur={(e) => {
                                        e.preventDefault();
                                        if (
                                            e.target.value !==
                                            checkpoint.fieldLabel
                                        ) {
                                            updateCheckpoint({
                                                axis,
                                                oldCheckpoint: checkpoint,
                                                newCheckpoint: {
                                                    ...checkpoint,
                                                    fieldLabel:
                                                        e.target.value
                                                            .length === 0
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
                            </Form.Control>

                            <Tooltip.TooltipProvider>
                                <Tooltip.Root>
                                    <Tooltip.Trigger type="button">
                                        <Info
                                            size={18}
                                            className="text-text/60"
                                        />
                                    </Tooltip.Trigger>
                                    <TooltipContents
                                        className="p-16"
                                        side="right"
                                    >
                                        The label to appear on the field. I.e.
                                        the yard markers
                                    </TooltipContents>
                                </Tooltip.Root>
                            </Tooltip.TooltipProvider>
                        </Form.Field>
                    )}
                    {axis === "x" && (
                        <Form.Field
                            name="Symmetrical"
                            className={formFieldClassname}
                            hidden={true}
                        >
                            <Form.Label className={labelClassname}>
                                Symmetrical
                            </Form.Label>
                            <Form.Control asChild>
                                <Switch className={inputClassname} />
                            </Form.Control>
                            <Tooltip.TooltipProvider>
                                <Tooltip.Root>
                                    <Tooltip.Trigger type="button">
                                        <Info
                                            size={18}
                                            className="text-text/60"
                                        />
                                    </Tooltip.Trigger>
                                    <TooltipContents
                                        className="p-16"
                                        side="right"
                                    >
                                        {/* This does not do anything yet */}
                                        If this checkpoint exists on both sides
                                        of the field
                                    </TooltipContents>
                                </Tooltip.Root>
                            </Tooltip.TooltipProvider>
                        </Form.Field>
                    )}
                    <Form.Field name="Visible" className={formFieldClassname}>
                        <Form.Label className={labelClassname}>
                            Visible
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    If this checkpoint should be visible on the
                                    field
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    <Form.Field
                        name="Use as reference"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Use as reference
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    If this checkpoint should be used as a
                                    reference for coordinates.
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    <Button
                        variant="red"
                        size="compact"
                        className="self-end text-white"
                        tooltipText="Delete this checkpoint from the field"
                        tooltipSide="right"
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

    return (
        <Form.Root
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col gap-16"
        >
            <div className="flex flex-col gap-16">
                <div className="flex flex-col gap-12">
                    <h4 className="text-lg">General</h4>
                    <Form.Field
                        name="Field Name"
                        className={formFieldClassname}
                    >
                        <Form.Label className={requiredLabelClassname}>
                            Field Name
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    The name of this field, stage, or grid
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    <Form.Field name="Step Size" className={formFieldClassname}>
                        <Form.Label className={requiredLabelClassname}>
                            Step Size
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents
                                    className="w-256 flex-wrap p-16 text-center"
                                    side="right"
                                >
                                    <div>
                                        The size of each step. The canvas will
                                        adjust to this number so that the size
                                        of it is always consistent with its
                                        real-world dimensions.
                                    </div>
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    <Form.Field
                        name="Measurement System"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Measurement System
                        </Form.Label>
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
                                label={fieldProperties?.name || "Field type"}
                            />
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="imperial">
                                        Imperial
                                    </SelectItem>
                                    <SelectItem value="metric">
                                        Metric
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents
                                    className="p-16 text-center"
                                    side="right"
                                >
                                    The unit of measurement to define the step
                                    size in. Can go back and forth
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>

                    <Form.Field
                        name="Half line X-Interval"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Half Line X-Interval
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents
                                    className="p-16 text-center"
                                    side="right"
                                >
                                    <div>
                                        The interval that half lines appear in
                                        the UI on the X axis from the center of
                                        the field.
                                    </div>
                                    <div>
                                        Leave empty to omit half lines on the
                                        X-axis.
                                    </div>
                                    <div>
                                        This is purely cosmetic and does not
                                        affect coordinates in any way
                                    </div>
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    <Form.Field
                        name="Half line Y-Interval"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Half Line Y-Interval
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents
                                    className="p-16 text-center"
                                    side="right"
                                >
                                    <div>
                                        The interval that half lines appear in
                                        the UI on the Y axis from the front of
                                        the field.
                                    </div>
                                    <div>
                                        Leave empty to omit half lines on the
                                        Y-axis.
                                    </div>
                                    <div>
                                        This is purely cosmetic and does not
                                        affect coordinates in any way
                                    </div>
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                </div>
                <div className="flex flex-col gap-12">
                    <h4 className="text-lg">Image Rendering</h4>
                    <Form.Field
                        name="Left"
                        className={clsx(
                            formFieldClassname,
                            "flex justify-between",
                        )}
                    >
                        <Form.Label
                            className={clsx(labelClassname, "col-span-4")}
                        >
                            Show Background Image
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                    </Form.Field>
                    <Form.Field
                        name="Measurement System"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Conform Method
                        </Form.Label>
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
                            defaultValue={currentFieldProperties.imageFillOrFit}
                        >
                            <SelectTriggerButton
                                className={inputClassname}
                                label={"Conforming Method"}
                            />
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="fit">Fit</SelectItem>
                                    <SelectItem value="fill">Fill</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents
                                    className="p-16 text-center"
                                    side="right"
                                >
                                    <div>
                                        Whether to fit the background image
                                        inside the field or fill it
                                    </div>
                                    <div>
                                        The aspect ratio is always maintained{" "}
                                    </div>
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>

                    <Button
                        className="self-end"
                        tooltipText="Import an image to display on the field"
                        tooltipSide="right"
                        variant="primary"
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
                        Import Image
                    </Button>
                    <div className="text-end text-sub">
                        Refresh the page after import [Ctrl + R]
                    </div>
                </div>
                <div className="flex flex-col gap-12">
                    <h4 className="text-lg">Side Descriptions</h4>
                    <Form.Field
                        name="Director's left"
                        className={formFieldClassname}
                    >
                        <Form.Label className={requiredLabelClassname}>
                            Director&apos;s Left
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    E.g. &quot;Side 1&quot;,&quot; Audience
                                    Left&quot; or &quot;Stage Right&quot;
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    <Form.Field
                        name="Director's left"
                        className={formFieldClassname}
                    >
                        <Form.Label className={requiredLabelClassname}>
                            Left Abbreviation
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    E.g. &quot;S1&quot;, &quot;AL&quot; or
                                    &quot;SR&quot; (short for &quot;Side
                                    1&quot;, &quot;Audience Left&quot; or
                                    &quot;Stage Right&quot;)
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>

                    <Form.Field
                        name="Director's right"
                        className={formFieldClassname}
                    >
                        <Form.Label className={requiredLabelClassname}>
                            Director&apos;s Right
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    E.g. &quot;Side 2&quot;,&quot; Audience
                                    Right&quot; or &quot;Stage Left&quot;
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    <Form.Field
                        name="Director's right"
                        className={formFieldClassname}
                    >
                        <Form.Label className={requiredLabelClassname}>
                            Right Abbreviation
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    E.g. &quot;S2&quot;, &quot;AR&quot; or
                                    &quot;SL&quot; (short for &quot;Side
                                    2&quot;, &quot;Audience Right&quot; or
                                    &quot;Stage Left&quot;)
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                </div>
                <div className="flex flex-col gap-12">
                    {/* <div className="mb-16">Field </div> */}
                    <h4 className="text-lg">Field Labels</h4>
                    <Form.Field
                        name="Steps from front to home label bottom"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Steps from front to home label bottom
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    Number of steps from the front sideline to
                                    the outside of the home number (closer to
                                    the front sideline)
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    <Form.Field
                        name="Steps from front to home label top"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Steps from front to home label top
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    Number of steps from the front sideline to
                                    the inside of the home number (closer to the
                                    center of the field)
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    <Form.Field
                        name="Steps from front to away label top"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Steps from front to away label top
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    Number of steps from the front sideline to
                                    the inside of the away number (closer to the
                                    center of the field)
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                    <Form.Field
                        name="Steps from front to away label bottom"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Steps from front to away label bottom
                        </Form.Label>
                        <Form.Control asChild>
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
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className={errorClassname}
                        >
                            Please enter a value.
                        </Form.Message>

                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <Info size={18} className="text-text/60" />
                                </Tooltip.Trigger>
                                <TooltipContents className="p-16" side="right">
                                    Number of steps from the front sideline to
                                    the outside of the away number (closer to
                                    the back sideline)
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                </div>
                <div className="flex flex-col gap-12">
                    {/* <div className="mb-16">Field </div> */}
                    <h4 className="text-lg">External Labels</h4>
                    <div className="grid grid-cols-4">
                        <Form.Field
                            name="Left"
                            className={clsx(
                                formFieldClassname,
                                "flex justify-between",
                            )}
                        >
                            <Form.Label
                                className={clsx(labelClassname, "col-span-4")}
                            >
                                Left
                            </Form.Label>
                            <Form.Control asChild>
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
                            </Form.Control>
                        </Form.Field>
                        <Form.Field
                            name="Right"
                            className={clsx(
                                formFieldClassname,
                                "flex justify-between",
                            )}
                        >
                            <Form.Label
                                className={clsx(labelClassname, "col-span-4")}
                            >
                                Right
                            </Form.Label>
                            <Form.Control asChild>
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
                            </Form.Control>
                        </Form.Field>
                        <Form.Field
                            name="Bottom"
                            className={clsx(
                                formFieldClassname,
                                "flex justify-between",
                            )}
                        >
                            <Form.Label className={labelClassname}>
                                Bottom
                            </Form.Label>
                            <Form.Control asChild>
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
                            </Form.Control>
                        </Form.Field>
                        <Form.Field
                            name="Top"
                            className={clsx(
                                formFieldClassname,
                                "flex justify-between",
                            )}
                        >
                            <Form.Label
                                className={clsx(labelClassname, "col-span-4")}
                            >
                                Top
                            </Form.Label>
                            <Form.Control asChild>
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
                            </Form.Control>
                        </Form.Field>
                    </div>
                </div>
            </div>
            <div>
                <div className="mb-16">X-Checkpoints</div>
                <div
                    className="mx-4 my-8 rounded-6 bg-red p-6 text-center text-white"
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
                    WARNING - The left and rightmost X-checkpoints are not
                    equidistant from the center. This may cause strange
                    graphical artifacts and should be fixed.
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
                    >
                        New X-Checkpoint
                    </Button>
                </div>
            </div>
            <div>
                <div className="mb-16">Y-Checkpoints</div>
                <div
                    className="mx-4 my-8 rounded-6 bg-red p-6 text-center text-white"
                    hidden={
                        Math.max(
                            ...currentFieldProperties.yCheckpoints.map(
                                (y) => y.stepsFromCenterFront,
                            ),
                        ) <= 0
                    }
                >
                    WARNING - It is highly recommended that all
                    Y-checkpoints&apos; steps be less than zero (i.e. negative
                    numbers). All of the Y-coordinates should be behind the
                    front of the field. Failing to do so may cause graphical
                    errors and unexpected coordinates.
                </div>
                <Form.Field
                    name="Use Hashes"
                    className={clsx(formFieldClassname, "mb-8")}
                >
                    <Form.Label className={labelClassname}>
                        Use Hashes
                    </Form.Label>
                    <Form.Control asChild>
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
                    </Form.Control>
                    <Tooltip.TooltipProvider>
                        <Tooltip.Root>
                            <Tooltip.Trigger type="button">
                                <Info size={18} className="text-text/60" />
                            </Tooltip.Trigger>
                            <TooltipContents
                                className="p-16 text-center"
                                side="right"
                            >
                                <div>
                                    Use hashes for the Y-checkpoints, like a
                                    football field.
                                </div>
                                <div>If unchecked, lines will be used.</div>
                            </TooltipContents>
                        </Tooltip.Root>
                    </Tooltip.TooltipProvider>
                </Form.Field>
                <div className="flex flex-col gap-12">
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
                <div className="mb-16 mt-16 flex justify-end">
                    <Button
                        onClick={() => addCheckpoint("y")}
                        size="compact"
                        className="self-end"
                    >
                        New Y-Checkpoint
                    </Button>
                </div>
            </div>
        </Form.Root>
    );
}
