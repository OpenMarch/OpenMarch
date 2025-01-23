import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldProperties, { Checkpoint } from "@/global/classes/FieldProperties";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { useCallback, useEffect, useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import * as Form from "@radix-ui/react-form";
import { Input } from "../ui/Input";

const defaultFieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

function XCheckpointEditor({
    checkpoint,
    updateCheckpoint,
}: {
    checkpoint: Checkpoint;
    updateCheckpoint: (args: {
        oldCheckpoint: Checkpoint;
        newCheckpoint: Checkpoint;
    }) => void;
}) {
    const [open, setOpen] = useState(false);
    const [localCheckpoint, setLocalCheckpoint] =
        useState<Checkpoint>(checkpoint);

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
                <Form.Root>
                    <Form.Field
                        name="Steps from center"
                        className="flex items-center justify-between"
                    >
                        <Form.Label className="text-body text-text/80">
                            Steps from center
                        </Form.Label>
                        <Form.Control asChild>
                            <Input
                                type="number"
                                placeholder="-"
                                onBlur={(e) => {
                                    e.preventDefault();
                                    updateCheckpoint({
                                        oldCheckpoint: checkpoint,
                                        newCheckpoint: localCheckpoint,
                                    });
                                }}
                                onChange={(e) => {
                                    e.preventDefault();
                                    setLocalCheckpoint({
                                        ...localCheckpoint,
                                        stepsFromCenterFront: Number(
                                            e.target.value,
                                        ),
                                    });
                                }}
                                value={localCheckpoint.stepsFromCenterFront}
                                required
                                maxLength={3}
                            />
                        </Form.Control>
                        <Form.Message
                            match={"valueMissing"}
                            className="text-sub leading-none text-red"
                        >
                            Please enter a value.
                        </Form.Message>
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldProperties]);

    return (
        <div>
            <div>
                <div className="font-bold">X Checkpoints</div>
                <div className="flex flex-col gap-12">
                    {currentFieldProperties.xCheckpoints
                        .sort(sorter)
                        .map((xCheckpoint, index) => (
                            <XCheckpointEditor
                                checkpoint={xCheckpoint}
                                updateCheckpoint={updateCheckpoint}
                                key={index}
                            />
                        ))}
                </div>
            </div>
        </div>
    );
}
