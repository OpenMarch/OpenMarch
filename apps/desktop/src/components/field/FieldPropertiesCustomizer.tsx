import {
    FieldProperties,
    Checkpoint,
    MeasurementSystem,
    FieldTheme,
} from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { useCallback, useEffect, useRef, useState } from "react";
import { BooksIcon } from "@phosphor-icons/react";
import * as Form from "@radix-ui/react-form";
import { Button, Tabs, TabsList, TabItem } from "@openmarch/ui";
import { toast } from "sonner";
import { RgbaColor } from "@uiw/react-color";
import { T, useTranslate } from "@tolgee/react";
import {
    fieldPropertiesQueryOptions,
    updateFieldPropertiesMutationOptions,
} from "@/hooks/queries";
import type {
    CheckpointPatch,
    FieldEditRequest,
    FieldEditResult,
} from "@/field/edits";
import { useApplyFieldEdits } from "@/hooks/useApplyFieldEdits";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GeneralTab } from "./customizer/GeneralTab";
import { CheckpointsTab } from "./customizer/CheckpointsTab";
import { ImageTab } from "./customizer/ImageTab";
import { ThemeTab } from "./customizer/ThemeTab";
import { blurOnEnterFunc } from "./customizer/utils";
import { siteUrl } from "@/global/siteUrl";

const defaultFieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

export default function FieldPropertiesCustomizer() {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { mutate: updateFieldProperties } = useMutation(
        updateFieldPropertiesMutationOptions(queryClient),
    );
    const [currentFieldProperties, setCurrentFieldProperties] =
        useState<FieldProperties>(fieldProperties ?? defaultFieldProperties);
    const [measurementSystem, setMeasurementSystem] =
        useState<MeasurementSystem>(currentFieldProperties.measurementSystem);
    const stepSizeInputRef = useRef<HTMLInputElement>(null);

    const blurOnEnter = useCallback(blurOnEnterFunc, []);

    // Checkpoint add, delete and update are field edits (#823): one undo step each, with the
    // invariants checked in the edit, not here. Refusals, warnings and failures are toasted there
    const applyFieldEdits = useApplyFieldEdits();

    const updateCheckpoint = useCallback(
        ({
            oldCheckpoint,
            newCheckpoint,
            axis,
        }: {
            oldCheckpoint: Checkpoint;
            newCheckpoint: Checkpoint;
            axis: "x" | "y";
        }): Promise<FieldEditResult | undefined> => {
            const ids = [{ axis, id: oldCheckpoint.id }];
            const edits: FieldEditRequest[] = [];
            if (
                newCheckpoint.stepsFromCenterFront !==
                oldCheckpoint.stepsFromCenterFront
            )
                edits.push({
                    edit: "moveCheckpoints",
                    // Typed positions keep the typed names
                    args: {
                        ids,
                        to: newCheckpoint.stepsFromCenterFront,
                        followNames: false,
                    },
                });
            const patch: CheckpointPatch = {
                ...(newCheckpoint.name !== oldCheckpoint.name
                    ? { name: newCheckpoint.name }
                    : {}),
                ...(newCheckpoint.terseName !== oldCheckpoint.terseName
                    ? { shortName: newCheckpoint.terseName }
                    : {}),
                ...(newCheckpoint.visible !== oldCheckpoint.visible
                    ? { visible: newCheckpoint.visible }
                    : {}),
                ...(newCheckpoint.useAsReference !==
                oldCheckpoint.useAsReference
                    ? { useAsReference: newCheckpoint.useAsReference }
                    : {}),
                ...(newCheckpoint.fieldLabel !== oldCheckpoint.fieldLabel
                    ? { fieldLabel: newCheckpoint.fieldLabel ?? "" }
                    : {}),
            };
            if (Object.keys(patch).length > 0)
                edits.push({ edit: "updateCheckpoints", args: { ids, patch } });
            if (edits.length === 0) return Promise.resolve(undefined);
            return applyFieldEdits(edits);
        },
        [applyFieldEdits],
    );

    const deleteCheckpoint = useCallback(
        (checkpoint: Checkpoint) => {
            void applyFieldEdits({
                edit: "removeCheckpoints",
                args: {
                    ids: [{ axis: checkpoint.axis, id: checkpoint.id }],
                },
            }).then((result) => {
                if (!result?.diff.ok || result.diff.empty) return;
                toast.success(
                    t("fieldProperties.checkpoint.deleted", {
                        axis: checkpoint.axis.toUpperCase(),
                        steps: checkpoint.stepsFromCenterFront,
                        name: checkpoint.name,
                    }),
                );
            });
        },
        [applyFieldEdits, t],
    );

    // B6: a new checkpoint goes halfway into the largest gap nearest the center, named from its
    // position, not on top of the outermost line
    const addCheckpoint = useCallback(
        (axis: "x" | "y") => {
            void applyFieldEdits({
                edit: "addCheckpoint",
                args: { axis },
            }).then((result) => {
                const added = result?.diff.checkpoints.added[0];
                if (!result?.diff.ok || !added) return;
                toast.success(
                    t("fieldProperties.checkpoint.created", {
                        axis: axis.toUpperCase(),
                        steps: added.stepsFromCenterFront,
                    }),
                );
            });
        },
        [applyFieldEdits, t],
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
            toast.error(t("fieldProperties.errors.invalidColor"));
            return false;
        }
        return true;
    };

    return (
        <Form.Root
            onSubmit={(e) => e.preventDefault()}
            className="mb-16 flex w-[34rem] flex-col gap-16"
        >
            <div className="flex items-center gap-8">
                <h4 className="text-h4">
                    <T keyName="fieldProperties.customField" />
                </h4>
                <a
                    href={siteUrl("/guides/editing-the-grid")}
                    target="_blank"
                    rel="noreferrer"
                    className="h-fit w-fit"
                >
                    <Button
                        size={"compact"}
                        variant="secondary"
                        className="w-fit min-w-fit whitespace-nowrap"
                    >
                        <BooksIcon size={22} />
                        <T keyName="fieldProperties.customFieldDocs" />
                    </Button>
                </a>
            </div>
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

                <GeneralTab
                    currentFieldProperties={currentFieldProperties}
                    updateFieldProperties={updateFieldProperties}
                    fieldProperties={fieldProperties}
                    measurementSystem={measurementSystem}
                    stepSizeInputRef={stepSizeInputRef}
                    blurOnEnter={blurOnEnter}
                />

                <CheckpointsTab
                    currentFieldProperties={currentFieldProperties}
                    updateFieldProperties={updateFieldProperties}
                    updateCheckpoint={updateCheckpoint}
                    deleteCheckpoint={deleteCheckpoint}
                    addCheckpoint={addCheckpoint}
                    sorter={sorter}
                />

                <ImageTab
                    currentFieldProperties={currentFieldProperties}
                    updateFieldProperties={updateFieldProperties}
                />

                <ThemeTab
                    currentFieldProperties={currentFieldProperties}
                    validateIsRgbaColor={validateIsRgbaColor}
                />
            </Tabs>
        </Form.Root>
    );
}
