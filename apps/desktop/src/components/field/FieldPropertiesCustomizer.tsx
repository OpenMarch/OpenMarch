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
import { T, useTolgee } from "@tolgee/react";
import {
    fieldPropertiesQueryOptions,
    updateFieldPropertiesMutationOptions,
} from "@/hooks/queries";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GeneralTab } from "./customizer/GeneralTab";
import { CheckpointsTab } from "./customizer/CheckpointsTab";
import { ImageTab } from "./customizer/ImageTab";
import { ThemeTab } from "./customizer/ThemeTab";
import { blurOnEnterFunc } from "./customizer/utils";

const defaultFieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

interface FieldPropertiesCustomizerProps {
    currentTemplate?: FieldProperties; // For wizard mode
}

export default function FieldPropertiesCustomizer({
    currentTemplate,
}: FieldPropertiesCustomizerProps = {}) {
    const { t } = useTolgee();
    const queryClient = useQueryClient();
    // Disable query if currentTemplate is provided (wizard mode)
    const { data: fieldProperties } = useQuery({
        ...fieldPropertiesQueryOptions(),
        enabled: !currentTemplate,
    });
    const { mutate: updateFieldProperties } = useMutation(
        updateFieldPropertiesMutationOptions(queryClient),
    );
    const [currentFieldProperties, setCurrentFieldProperties] =
        useState<FieldProperties>(
            currentTemplate ?? fieldProperties ?? defaultFieldProperties,
        );
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
                updateFieldProperties(
                    new FieldProperties({
                        ...currentFieldProperties,
                        xCheckpoints: newCheckpoints,
                    }),
                );
            } else {
                updateFieldProperties(
                    new FieldProperties({
                        ...currentFieldProperties,
                        yCheckpoints: newCheckpoints,
                    }),
                );
            }
        },
        [currentFieldProperties, updateFieldProperties],
    );

    const deleteCheckpoint = useCallback(
        (checkpoint: Checkpoint) => {
            if (checkpoint.axis === "x") {
                const newCheckpoints =
                    currentFieldProperties.xCheckpoints.filter(
                        (c) => c.id !== checkpoint.id,
                    );
                updateFieldProperties(
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
                updateFieldProperties(
                    new FieldProperties({
                        ...currentFieldProperties,
                        yCheckpoints: newCheckpoints,
                    }),
                );
            }
            toast.success(
                // `${checkpoint.axis.toUpperCase()}-checkpoint at ${checkpoint.stepsFromCenterFront} steps deleted - "${checkpoint.name}"`,
                t("fieldProperties.checkpoint.deleted", {
                    axis: checkpoint.axis.toUpperCase(),
                    steps: checkpoint.stepsFromCenterFront,
                    name: checkpoint.name,
                }),
            );
        },
        [currentFieldProperties, updateFieldProperties, t],
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
                    name: t("fieldProperties.checkpoint.newXCheckpointName"),
                    terseName: "TBD",
                    axis: "x",
                    stepsFromCenterFront: maxXCheckpointSteps,
                    useAsReference: true,
                    visible: true,
                };
                updateFieldProperties(
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
                    name: t("fieldProperties.checkpoint.newYCheckpointName"),
                    terseName: "TBD",
                    axis: "y",
                    stepsFromCenterFront: maxYCheckpointSteps,
                    useAsReference: true,
                    visible: true,
                };
                updateFieldProperties(
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
                t("fieldProperties.checkpoint.created", {
                    axis: axis.toUpperCase(),
                    steps: newSteps,
                }),
            );
        },
        [currentFieldProperties, updateFieldProperties, t],
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
                    href="https://openmarch.com/guides/editing-the-grid"
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
