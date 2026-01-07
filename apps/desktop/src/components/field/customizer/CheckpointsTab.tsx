import { FieldProperties } from "@openmarch/core";
import { TabContent, Button, Switch } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import FormField from "../../ui/FormField";
import { CheckpointsTabProps } from "./types";
import { CheckpointEditor } from "./CheckpointEditor";
import { inputClassname } from "./utils";

export function CheckpointsTab({
    currentFieldProperties,
    updateFieldProperties,
    updateCheckpoint,
    deleteCheckpoint,
    addCheckpoint,
    sorter,
}: CheckpointsTabProps) {
    const { t } = useTolgee();

    return (
        <TabContent value="checkpoints" className="flex flex-col gap-32">
            {/* -------------------------------------------- CHECKPOINTS -------------------------------------------- */}
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
                        tooltip={t("fieldProperties.tooltips.useHashes")}
                    >
                        <Switch
                            className={inputClassname}
                            checked={currentFieldProperties.useHashes}
                            onClick={(e) => {
                                e.preventDefault();
                                updateFieldProperties(
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
    );
}
