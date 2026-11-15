import { Checkpoint } from "@openmarch/core";
import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { useState } from "react";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { Input, Button, Switch } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import type { FieldEditResult } from "@/field/edits";
import FormField from "../../ui/FormField";
import { inputClassname, blurOnEnterFunc as blurOnEnter } from "./utils";

/** Resolves with the edit's result (what was stored), when there was an edit */
export type UpdateCheckpoint = (args: {
    oldCheckpoint: Checkpoint;
    newCheckpoint: Checkpoint;
    axis: "x" | "y";
}) => Promise<FieldEditResult | undefined> | void;

interface CheckpointEditorProps {
    checkpoint: Checkpoint;
    deleteCheckpoint: (checkpoint: Checkpoint) => void;
    updateCheckpoint: UpdateCheckpoint;
    axis: "x" | "y";
}

export function CheckpointEditor({
    checkpoint,
    updateCheckpoint,
    deleteCheckpoint,
    axis,
}: CheckpointEditorProps) {
    const { t } = useTranslate();
    const [open, setOpen] = useState(false);

    // Local state for validated fields - initialized from props, reset via key={checkpoint.id} in parent
    const [stepsValue, setStepsValue] = useState(
        String(checkpoint.stepsFromCenterFront),
    );
    const [nameValue, setNameValue] = useState(checkpoint.name);
    const [terseNameValue, setTerseNameValue] = useState(checkpoint.terseName);

    // Validation helpers
    const isStepsValid =
        stepsValue.trim() !== "" && !isNaN(parseFloat(stepsValue));
    const isNameValid = nameValue.trim() !== "";
    const isTerseNameValid = terseNameValue.trim() !== "";

    // After a commit the input shows what was stored: the old value when the edit was refused,
    // the rounded one when it was snapped (10.125 is stored as 10.13)
    const commitDraft = (
        field: "steps" | "name" | "terseName",
        newCheckpoint: Checkpoint,
    ) =>
        void Promise.resolve(
            updateCheckpoint({
                axis,
                oldCheckpoint: checkpoint,
                newCheckpoint,
            }),
        ).then((result) => {
            const stored =
                (result &&
                    (axis === "x"
                        ? result.next.xCheckpoints
                        : result.next.yCheckpoints
                    ).find((c) => c.id === checkpoint.id)) ||
                checkpoint;
            if (field === "steps")
                setStepsValue(String(stored.stepsFromCenterFront));
            else if (field === "name") setNameValue(stored.name);
            else setTerseNameValue(stored.terseName);
        });

    const errorInputClassname = `${inputClassname} border-red`;

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
                        <T
                            keyName="fieldProperties.measurements.steps"
                            params={{ count: checkpoint.stepsFromCenterFront }}
                        />
                    </p>
                </div>
                {open ? <CaretUpIcon size={20} /> : <CaretDownIcon size={20} />}
            </RadixCollapsible.Trigger>
            <RadixCollapsible.Content className="bg-fg-2 border-stroke rounded-6 mt-6 border p-8 pt-16">
                <div className="flex flex-col gap-12">
                    <FormField
                        label={
                            axis === "x"
                                ? t(
                                      "fieldProperties.checkpoint.stepsFromCenter",
                                  )
                                : t("fieldProperties.checkpoint.stepsFromFront")
                        }
                        tooltip={
                            axis === "x"
                                ? t(
                                      "fieldProperties.checkpoint.stepsFromCenterHint",
                                  )
                                : t(
                                      "fieldProperties.checkpoint.stepsFromFrontTooltip",
                                  )
                        }
                    >
                        <Input
                            type="text"
                            inputMode="numeric"
                            pattern="-?[0-9]*\.?[0-9]*"
                            className={
                                isStepsValid
                                    ? inputClassname
                                    : errorInputClassname
                            }
                            value={stepsValue}
                            onBlur={(e) => {
                                e.preventDefault();
                                const trimmed = stepsValue.trim();
                                const parsedFloat = parseFloat(trimmed);

                                if (trimmed !== "" && !isNaN(parsedFloat)) {
                                    commitDraft("steps", {
                                        ...checkpoint,
                                        stepsFromCenterFront: parsedFloat,
                                    });
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
                                setStepsValue(normalized);
                            }}
                            onKeyDown={blurOnEnter}
                            required
                            maxLength={10}
                        />
                    </FormField>
                    <FormField
                        label={t("fieldProperties.checkpoint.name")}
                        tooltip={t("fieldProperties.checkpoint.nameTooltip")}
                    >
                        <Input
                            type="text"
                            className={
                                isNameValid
                                    ? inputClassname
                                    : errorInputClassname
                            }
                            value={nameValue}
                            onBlur={(e) => {
                                e.preventDefault();
                                const trimmed = nameValue.trim();
                                if (trimmed !== "") {
                                    commitDraft("name", {
                                        ...checkpoint,
                                        name: trimmed,
                                    });
                                }
                            }}
                            onChange={(e) => setNameValue(e.target.value)}
                            onKeyDown={blurOnEnter}
                            required
                            maxLength={40}
                        />
                    </FormField>
                    <FormField
                        label={t("fieldProperties.checkpoint.shortName")}
                        tooltip={t(
                            "fieldProperties.checkpoint.shortNameTooltip",
                        )}
                    >
                        <Input
                            type="text"
                            className={
                                isTerseNameValid
                                    ? inputClassname
                                    : errorInputClassname
                            }
                            value={terseNameValue}
                            onBlur={(e) => {
                                e.preventDefault();
                                const trimmed = terseNameValue.trim();
                                if (
                                    trimmed !== "" &&
                                    trimmed !== checkpoint.terseName
                                ) {
                                    commitDraft("terseName", {
                                        ...checkpoint,
                                        terseName: trimmed,
                                    });
                                }
                            }}
                            onChange={(e) => setTerseNameValue(e.target.value)}
                            onKeyDown={blurOnEnter}
                            required
                        />
                    </FormField>
                    {axis === "x" && (
                        <FormField
                            label={t("fieldProperties.checkpoint.fieldLabel")}
                            tooltip={t(
                                "fieldProperties.checkpoint.fieldLabelTooltip",
                            )}
                        >
                            <Input
                                type="text" // Changed from "number"
                                onBlur={(e) => {
                                    e.preventDefault();
                                    if (
                                        e.target.value !== checkpoint.fieldLabel
                                    ) {
                                        void updateCheckpoint({
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
                        label={t("fieldProperties.checkpoint.visible")}
                        tooltip={t("fieldProperties.checkpoint.visibleTooltip")}
                    >
                        <Switch
                            className={inputClassname}
                            checked={checkpoint.visible}
                            onClick={(e) => {
                                e.preventDefault();
                                void updateCheckpoint({
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
                        label={t("fieldProperties.checkpoint.useAsReference")}
                        tooltip={t(
                            "fieldProperties.checkpoint.useAsReferenceTooltip",
                        )}
                    >
                        <Switch
                            className={inputClassname}
                            checked={checkpoint.useAsReference}
                            onClick={(e) => {
                                e.preventDefault();
                                void updateCheckpoint({
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
                        tooltipText={t(
                            "fieldProperties.checkpoint.deleteTooltip",
                        )}
                        tooltipSide="right"
                        type="button"
                        onClick={() => {
                            deleteCheckpoint(checkpoint);
                        }}
                    >
                        <T keyName="fieldProperties.checkpoint.delete" />
                    </Button>
                </div>
            </RadixCollapsible.Content>
        </RadixCollapsible.Root>
    );
}
