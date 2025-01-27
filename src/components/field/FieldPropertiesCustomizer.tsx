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
    const blurOnEnter = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.currentTarget.blur();
            }
        },
        [],
    );

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

    const formFieldClassname = clsx("grid grid-cols-12 gap-8 h-[40px]");
    const labelClassname = clsx(
        "text-body text-text/80 self-center col-span-5",
    );
    const inputClassname = clsx("col-span-6 self-center");
    const tooltipClassname = clsx("");
    const errorClassname = clsx("text-md leading-none text-red mt-8");

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
                <Form.Root
                    onSubmit={(e) => e.preventDefault()}
                    className="flex flex-col gap-8"
                >
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
                </Form.Root>
            </RadixCollapsible.Content>
        </RadixCollapsible.Root>
    );
}
export default function FieldPropertiesCustomizer() {
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;
    const [currentFieldProperties, setCurrentFieldProperties] =
        useState<FieldProperties>(fieldProperties ?? defaultFieldProperties);

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
        // Eslint disable to avoid infinite loop
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldProperties]);

    return (
        <div className="flex flex-col gap-16">
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
        </div>
    );
}
