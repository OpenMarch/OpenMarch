import { FieldProperties } from "@openmarch/core";
import { updateFieldPropertiesImage } from "@/global/classes/FieldProperties";
import { TabContent, Button, Switch } from "@openmarch/ui";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import FormField from "../../ui/FormField";
import { inputClassname } from "./utils";
import clsx from "clsx";

interface ImageTabProps {
    currentFieldProperties: FieldProperties;
    updateFieldProperties: (props: FieldProperties) => void;
}

export function ImageTab({
    currentFieldProperties,
    updateFieldProperties,
}: ImageTabProps) {
    const { t } = useTolgee();

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

                <div className="flex h-fit min-h-0 items-center gap-8">
                    <label htmlFor="field-properties-image-input">
                        <Button
                            className="w-full"
                            tooltipText={t(
                                "fieldProperties.tooltips.importImage",
                            )}
                            tooltipSide="right"
                            variant="primary"
                            type="button"
                            size="compact"
                            onClick={() => {
                                // one would hope the label "for" would be good enough, but it's not
                                // so we need to manually click the file input
                                document
                                    .getElementById(
                                        "field-properties-image-input",
                                    )
                                    ?.click();
                            }}
                        >
                            <T keyName="fieldProperties.buttons.importImage" />
                        </Button>
                    </label>
                    <input
                        type="file"
                        id="field-properties-image-input"
                        className="hidden"
                        accept="image/*"
                        onChange={async (
                            e: React.ChangeEvent<HTMLInputElement>,
                        ) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const arrayBuffer = await file.arrayBuffer();
                            const raw = new Uint8Array(arrayBuffer);
                            await updateFieldPropertiesImage(raw);
                            updateFieldProperties(
                                new FieldProperties({
                                    ...currentFieldProperties,
                                    showFieldImage: true,
                                }),
                            );
                        }}
                    />
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
                            <T keyName="fieldProperties.units.steps" />
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
                            <T keyName="fieldProperties.units.steps" />
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
                                    return "N/A";
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
    );
}
