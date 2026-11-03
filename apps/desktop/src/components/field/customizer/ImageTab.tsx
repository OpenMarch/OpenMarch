import { FieldProperties } from "@openmarch/core";
import { TabContent, Switch, Slider } from "@openmarch/ui";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import { fieldLengthText } from "./fieldSizeText";
import FormField, { StaticFormField } from "../../ui/FormField";
import { inputClassname } from "./utils";
import FieldFloorControls from "./FieldFloorControls";
import clsx from "clsx";
import { useState, useEffect, useMemo, useCallback } from "react";

interface ImageTabProps {
    currentFieldProperties: FieldProperties;
    updateFieldProperties: (props: FieldProperties) => void;
}

export function ImageTab({
    currentFieldProperties,
    updateFieldProperties,
}: ImageTabProps) {
    const tolgee = useTolgee(["language"]);
    const t = tolgee.t;
    const language = tolgee.getLanguage();
    const [opacityValue, setOpacityValue] = useState(
        currentFieldProperties.backgroundImageOpacity,
    );

    useEffect(() => {
        setOpacityValue(currentFieldProperties.backgroundImageOpacity);
    }, [currentFieldProperties.backgroundImageOpacity]);

    const handleOpacityChange = useCallback((values: number[]) => {
        setOpacityValue(values[0]);
    }, []);

    const handleOpacityCommit = useCallback(
        (values: number[]) => {
            updateFieldProperties(
                new FieldProperties({
                    ...currentFieldProperties,
                    backgroundImageOpacity: values[0],
                }),
            );
        },
        [currentFieldProperties, updateFieldProperties],
    );

    const opacityPercentage = useMemo(
        () => Math.round(opacityValue * 100),
        [opacityValue],
    );

    return (
        <TabContent value="image" className="flex flex-col gap-32">
            {/* -------------------------------------------- IMAGE -------------------------------------------- */}
            <div className="flex flex-col gap-12">
                <h4 className="text-h4 mb-8">
                    <T keyName="fieldProperties.sections.imageRendering" />
                </h4>
                <FormField
                    label={t("fieldProperties.labels.showBackgroundImage")}
                >
                    <Switch
                        className={clsx(inputClassname, "col-span-2")}
                        checked={currentFieldProperties.showFieldImage}
                        onClick={(e) => {
                            e.preventDefault();
                            updateFieldProperties(
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
                    tooltip={t("fieldProperties.tooltips.conformMethod")}
                >
                    <Select
                        onValueChange={(e) => {
                            const newValue =
                                e === "fit" || e === "fill" ? e : "fit";
                            updateFieldProperties(
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
                            label={t("fieldProperties.labels.conformingMethod")}
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
                <StaticFormField
                    label={t("fieldProperties.labels.backgroundImageOpacity")}
                >
                    <div className="flex w-full items-center gap-12">
                        <div className="flex min-w-0 flex-1 items-center">
                            <Slider
                                min={0}
                                max={1}
                                step={0.01}
                                value={[opacityValue]}
                                onValueChange={handleOpacityChange}
                                onValueCommit={handleOpacityCommit}
                                aria-label={t(
                                    "fieldProperties.labels.backgroundImageOpacity",
                                )}
                                style={{ width: "100%" }}
                            />
                        </div>
                        <div className="bg-fg-2 border-stroke rounded-6 min-w-64 shrink-0 border px-8 py-2 text-center font-mono">
                            {opacityPercentage}%
                        </div>
                    </div>
                </StaticFormField>

                <FieldFloorControls fieldProperties={currentFieldProperties} />
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
                            {t("fieldProperties.measurements.steps", {
                                count:
                                    currentFieldProperties.width /
                                    currentFieldProperties.pixelsPerStep,
                            })}
                        </div>
                        <div className="bg-fg-2 border-stroke rounded-6 w-full border px-8 py-2 text-center font-mono">
                            {fieldLengthText(
                                currentFieldProperties.totalWidthInches,
                                currentFieldProperties.measurementSystem,
                                t,
                                language,
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex w-full flex-col gap-4">
                    <div className={clsx("col-span-2 align-middle")}>
                        <T keyName="fieldProperties.labels.height" />
                    </div>
                    <div className="flex w-full gap-8">
                        <div className="bg-fg-2 border-stroke rounded-6 w-full border px-8 py-2 text-center font-mono">
                            {t("fieldProperties.measurements.steps", {
                                count:
                                    currentFieldProperties.height /
                                    currentFieldProperties.pixelsPerStep,
                            })}
                        </div>
                        <div className="bg-fg-2 border-stroke rounded-6 w-full border px-8 py-2 text-center font-mono">
                            {fieldLengthText(
                                currentFieldProperties.totalHeightInches,
                                currentFieldProperties.measurementSystem,
                                t,
                                language,
                            )}
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
                                const gcd = (a: number, b: number): number =>
                                    b ? gcd(b, a % b) : a;
                                const divisor = gcd(w, h);
                                const ratioStr = `${w / divisor}:${h / divisor}`;
                                const divStr = (w / h).toFixed(3);
                                if (ratioStr.length > 12) {
                                    return divStr;
                                } else {
                                    return t(
                                        "fieldProperties.messages.fieldRatio",
                                        {
                                            ratio: ratioStr,
                                            decimal: divStr,
                                        },
                                    );
                                }
                            })()}
                        </div>
                        <div className="bg-fg-2 border-stroke rounded-6 w-fit border px-8 py-2 text-center font-mono">
                            <T keyName="fieldProperties.labels.widthHeight" />
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
                                    return t(
                                        "fieldProperties.labels.noBackgroundImage",
                                    );
                                }
                                const w = FieldProperties.imageDimensions.width;
                                const h =
                                    FieldProperties.imageDimensions.height;
                                const gcd = (a: number, b: number): number =>
                                    b ? gcd(b, a % b) : a;
                                const divisor = gcd(w, h);
                                const ratioStr = `${w / divisor}:${h / divisor}`;
                                const divStr = (w / h).toFixed(3);
                                if (ratioStr.length > 12) {
                                    return divStr;
                                } else {
                                    return t(
                                        "fieldProperties.messages.fieldRatio",
                                        {
                                            ratio: ratioStr,
                                            decimal: divStr,
                                        },
                                    );
                                }
                            })()}
                        </div>
                        <div className="bg-fg-2 border-stroke rounded-6 w-fit border px-8 py-2 text-center font-mono">
                            <T keyName="fieldProperties.labels.widthHeight" />
                        </div>
                    </div>
                </div>
                <div className="text-sub text-text mx-16 rounded-full py-4 text-end text-pretty">
                    <T keyName="fieldProperties.messages.measurementModificationNote" />
                </div>
            </div>
        </TabContent>
    );
}
