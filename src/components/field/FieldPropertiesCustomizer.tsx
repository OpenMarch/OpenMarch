import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldProperties, { Checkpoint } from "@/global/classes/FieldProperties";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { useCallback, useEffect, useState } from "react";
import { CaretDown, CaretUp, Info } from "@phosphor-icons/react";
import * as Form from "@radix-ui/react-form";
import { Input } from "../ui/Input";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipContents } from "../ui/Tooltip";
import clsx from "clsx";
import { Switch } from "../ui/Switch";

const defaultFieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

const formFieldClassname = clsx("grid grid-cols-12 gap-8 h-[40px]");
const labelClassname = clsx("text-body text-text/80 self-center col-span-5");
const inputClassname = clsx("col-span-6 self-center");
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
    allCheckpoints,
    axis,
}: {
    checkpoint: Checkpoint;
    updateCheckpoint: (args: {
        oldCheckpoint: Checkpoint;
        newCheckpoint: Checkpoint;
    }) => void;
    allCheckpoints: Checkpoint[];
    axis: "x" | "y";
}) {
    const [open, setOpen] = useState(false);
    const [hasDuplicateName, setHasDuplicateName] = useState(false);

    /**
     * A callback function that blurs the current input element when the "Enter" key is pressed.
     * This is used to handle the behavior of the input field when the user presses the "Enter" key,
     * ensuring that the focus is removed from the input.
     **/
    const blurOnEnter = useCallback(blurOnEnterFunc, []);

    /**
     * A callback function that checks if a checkpoint with the given name already exists in the `allCheckpoints` array.
     * If another checkpoint with the same name is found, it returns `true`, indicating a duplicate name.
     *
     * @param name - The name of the checkpoint to check for duplicates.
     * @returns `true` if a checkpoint with the same name already exists, `false` otherwise.
     */
    const checkForDuplicateName = useCallback(
        (name: string) => {
            const existingCheckpoint = allCheckpoints.find(
                (checkpoint) => checkpoint.name === name,
            );
            return !!existingCheckpoint;
        },
        [allCheckpoints],
    );

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
                            <Form.Label className={labelClassname}>
                                Steps from center*
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
                                        The number of steps away from the center
                                        of the field that this checkpoint is.{" "}
                                        <br />
                                        Negative is to the audience&apos;s left,
                                        positive to the right.
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
                            <Form.Label className={labelClassname}>
                                Name*
                            </Form.Label>
                            <Form.Control asChild>
                                <Input
                                    type="text" // Changed from "number"
                                    onBlur={(e) => {
                                        e.preventDefault();
                                        if (
                                            e.target.value !== checkpoint.name
                                        ) {
                                            // Set validation state using aria-invalid
                                            const hasDuplicate =
                                                checkForDuplicateName(
                                                    e.target.value,
                                                );
                                            setHasDuplicateName(hasDuplicate);
                                            if (!hasDuplicate) {
                                                updateCheckpoint({
                                                    oldCheckpoint: checkpoint,
                                                    newCheckpoint: {
                                                        ...checkpoint,
                                                        name: e.target.value,
                                                    },
                                                });
                                            }
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
                        {hasDuplicateName && (
                            <Form.Message className={errorClassname}>
                                Checkpoint with this name already exists.
                            </Form.Message>
                        )}
                    </Form.Field>
                    <Form.Field
                        name="Short Name"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Short Name
                        </Form.Label>
                        <Form.Control asChild>
                            <Input
                                type="text" // Changed from "number"
                                onBlur={(e) => {
                                    e.preventDefault();
                                    if (e.target.value !== checkpoint.name) {
                                        updateCheckpoint({
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
                </div>
            </RadixCollapsible.Content>
        </RadixCollapsible.Root>
    );
}
export default function FieldPropertiesCustomizer() {
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;
    const [currentFieldProperties, setCurrentFieldProperties] =
        useState<FieldProperties>(fieldProperties ?? defaultFieldProperties);

    const blurOnEnter = useCallback(blurOnEnterFunc, []);

    const updateCheckpoint = useCallback(
        ({
            oldCheckpoint,
            newCheckpoint,
        }: {
            oldCheckpoint: Checkpoint;
            newCheckpoint: Checkpoint;
        }) => {
            let found = false;
            const newCheckpoints = currentFieldProperties.xCheckpoints.map(
                (checkpoint) => {
                    if (!found && checkpoint.name === oldCheckpoint.name) {
                        found = true;
                        return newCheckpoint;
                    }
                    return checkpoint;
                },
            );
            if (!found) {
                console.error(
                    `Checkpoint with name ${oldCheckpoint.name} not found`,
                );
                return;
            }
            setFieldProperties({
                ...currentFieldProperties,
                xCheckpoints: newCheckpoints,
            });
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
        console.log(fieldProperties);
        // Eslint disable to avoid infinite loop
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldProperties]);

    return (
        <Form.Root
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col gap-16"
        >
            <div className="flex flex-col gap-16">
                {/* <div className="mb-16">Field </div> */}
                <div className="flex flex-col gap-12">
                    <h4 className="text-lg">Grid</h4>
                    <Form.Field
                        name="Half line X-Interval"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Half line X-Interval
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
                                        setFieldProperties({
                                            ...currentFieldProperties,
                                            halfLineXInterval: undefined,
                                        });
                                    } else {
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties({
                                                ...currentFieldProperties,
                                                halfLineXInterval: parsedFloat,
                                            });
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
                                    <div>
                                        The interval that half lines appear in
                                        the UI on the X axis from the center of
                                        the field.
                                    </div>
                                    <div>
                                        Leave empty to omit half lines on the
                                        X-axis.
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
                            Half line Y-Interval
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
                                        setFieldProperties({
                                            ...currentFieldProperties,
                                            halfLineYInterval: undefined,
                                        });
                                    } else {
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties({
                                                ...currentFieldProperties,
                                                halfLineYInterval: parsedFloat,
                                            });
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
                                    <div>
                                        The interval that half lines appear in
                                        the UI on the Y axis from the front of
                                        the field.
                                    </div>
                                    <div>
                                        Leave empty to omit half lines on the
                                        Y-axis.
                                    </div>
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    </Form.Field>
                </div>
                <div className="flex flex-col gap-12">
                    <h4 className="text-lg">Side Descriptions</h4>
                    <Form.Field
                        name="Director's left"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Director&apos;s left*
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
                                        setFieldProperties({
                                            ...currentFieldProperties,
                                            sideDescriptions: {
                                                ...currentFieldProperties.sideDescriptions,
                                                verboseLeft: e.target.value,
                                            },
                                        });
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
                        <Form.Label className={labelClassname}>
                            Left abbreviation*
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
                                        setFieldProperties({
                                            ...currentFieldProperties,
                                            sideDescriptions: {
                                                ...currentFieldProperties.sideDescriptions,
                                                terseLeft: e.target.value,
                                            },
                                        });
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
                        <Form.Label className={labelClassname}>
                            Director&apos;s right*
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
                                        setFieldProperties({
                                            ...currentFieldProperties,
                                            sideDescriptions: {
                                                ...currentFieldProperties.sideDescriptions,
                                                verboseRight: e.target.value,
                                            },
                                        });
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
                        <Form.Label className={labelClassname}>
                            Right abbreviation*
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
                                        setFieldProperties({
                                            ...currentFieldProperties,
                                            sideDescriptions: {
                                                ...currentFieldProperties.sideDescriptions,
                                                terseRight: e.target.value,
                                            },
                                        });
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
                        name="Steps from front to label bottom"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Steps from front to label bottom*
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
                                        setFieldProperties({
                                            ...currentFieldProperties,
                                            yardNumberCoordinates: {
                                                ...currentFieldProperties.yardNumberCoordinates,
                                                homeStepsFromFrontToOutside:
                                                    undefined,
                                            },
                                        });
                                    } else {
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );
                                        console.info(parsedFloat);

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties({
                                                ...currentFieldProperties,
                                                yardNumberCoordinates: {
                                                    ...currentFieldProperties.yardNumberCoordinates,
                                                    homeStepsFromFrontToOutside:
                                                        parsedFloat,
                                                },
                                            });
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
                        name="Steps from front to label top"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Steps from front to label top*
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
                                        setFieldProperties({
                                            ...currentFieldProperties,
                                            yardNumberCoordinates: {
                                                ...currentFieldProperties.yardNumberCoordinates,
                                                homeStepsFromFrontToInside:
                                                    undefined,
                                            },
                                        });
                                    } else {
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );
                                        console.info(parsedFloat);

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties({
                                                ...currentFieldProperties,
                                                yardNumberCoordinates: {
                                                    ...currentFieldProperties.yardNumberCoordinates,
                                                    homeStepsFromFrontToInside:
                                                        parsedFloat,
                                                },
                                            });
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
                        name="Steps from back to label top"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Steps from back to label top*
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
                                        setFieldProperties({
                                            ...currentFieldProperties,
                                            yardNumberCoordinates: {
                                                ...currentFieldProperties.yardNumberCoordinates,
                                                awayStepsFromFrontToInside:
                                                    undefined,
                                            },
                                        });
                                    } else {
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );
                                        console.info(parsedFloat);

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties({
                                                ...currentFieldProperties,
                                                yardNumberCoordinates: {
                                                    ...currentFieldProperties.yardNumberCoordinates,
                                                    awayStepsFromFrontToInside:
                                                        parsedFloat,
                                                },
                                            });
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
                        name="Steps from back to label bottom"
                        className={formFieldClassname}
                    >
                        <Form.Label className={labelClassname}>
                            Steps from back to label bottom*
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
                                        setFieldProperties({
                                            ...currentFieldProperties,
                                            yardNumberCoordinates: {
                                                ...currentFieldProperties.yardNumberCoordinates,
                                                awayStepsFromFrontToOutside:
                                                    undefined,
                                            },
                                        });
                                    } else {
                                        const parsedFloat = parseFloat(
                                            e.target.value,
                                        );
                                        console.info(parsedFloat);

                                        if (!isNaN(parsedFloat)) {
                                            setFieldProperties({
                                                ...currentFieldProperties,
                                                yardNumberCoordinates: {
                                                    ...currentFieldProperties.yardNumberCoordinates,
                                                    awayStepsFromFrontToOutside:
                                                        parsedFloat,
                                                },
                                            });
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
            </div>
            <div>
                <div className="mb-16">X Checkpoints</div>
                <div className="flex flex-col gap-12">
                    {currentFieldProperties.xCheckpoints
                        .sort(sorter)
                        .map((xCheckpoint) => (
                            <CheckpointEditor
                                checkpoint={xCheckpoint}
                                updateCheckpoint={updateCheckpoint}
                                allCheckpoints={
                                    currentFieldProperties.xCheckpoints
                                }
                                key={xCheckpoint.id}
                                axis="x"
                            />
                        ))}
                </div>
            </div>
            <div>
                <div className="mb-16">Y Checkpoints</div>
                <div className="flex flex-col gap-12">
                    {currentFieldProperties.yCheckpoints
                        .sort(sorter)
                        .map((yCheckpoint) => (
                            <CheckpointEditor
                                checkpoint={yCheckpoint}
                                updateCheckpoint={updateCheckpoint}
                                allCheckpoints={
                                    currentFieldProperties.yCheckpoints
                                }
                                key={yCheckpoint.id}
                                axis="y"
                            />
                        ))}
                </div>
            </div>
        </Form.Root>
    );
}
