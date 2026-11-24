import { useEffect, useRef, useState } from "react";
import { FieldProperties } from "@openmarch/core";
import { UnitInput } from "@openmarch/ui";
import FieldPropertiesSelector from "@/components/field/FieldPropertiesSelector";
import FieldPreview from "@/components/field/FieldPreview";
import type { NewShowEnsembleData, NewShowFieldData } from "../../newShowTypes";
import { T, useTranslate } from "@tolgee/react";
import {
    getDefaultFieldTemplate,
    isIndoorFloorActivity,
} from "@/global/classes/Activities";
import IndoorFloorPicker, {
    useFloorImage,
} from "@/components/field/IndoorFloorPicker";
import { indoorFloorOf } from "@/global/classes/fieldTemplates/indoorFloors";
import { Button } from "@openmarch/ui";
import { ActivityPicker } from "./EnsembleStep";

interface FieldStepProps {
    ensemble: NewShowEnsembleData | null;
    field: NewShowFieldData | null;
    onChange: (field: NewShowFieldData) => void;
    /** Given for a blank show, whose activity is picked here, above the field */
    onEnsembleChange?: (ensemble: NewShowEnsembleData) => void;
}

export default function FieldStep({
    ensemble,
    field,
    onChange,
    onEnsembleChange,
}: FieldStepProps) {
    const activity = ensemble?.activity;
    const defaultTemplate = getDefaultFieldTemplate(activity);

    const [currentTemplate, setCurrentTemplate] = useState<FieldProperties>(
        field?.template ?? defaultTemplate,
    );
    const indoor = isIndoorFloorActivity(activity);
    const [allFields, setAllFields] = useState(
        () => indoor && indoorFloorOf(currentTemplate) === null,
    );
    const prevActivity = useRef(activity);
    const hasInitializedField = useRef(field !== null);

    useEffect(() => {
        if (!hasInitializedField.current && !field) {
            hasInitializedField.current = true;
            onChange({
                template: defaultTemplate,
                isCustom: defaultTemplate.isCustom ?? false,
            });
            return;
        }

        if (prevActivity.current === activity) return;
        prevActivity.current = activity;
        setCurrentTemplate(defaultTemplate);
        setAllFields(false);
        onChange({
            template: defaultTemplate,
            isCustom: defaultTemplate.isCustom ?? false,
            image: null,
        });
    }, [activity, field, defaultTemplate, onChange]);

    // Field image only comes from the indoor floor picker; any other field drops it
    const image = field?.image ?? null;
    const drawnImage = useFloorImage(image);
    const showFloorPicker =
        indoor && !allFields && indoorFloorOf(currentTemplate) !== null;

    const handleTemplateChange = (
        template: FieldProperties,
        nextImage: Uint8Array | null = null,
    ) => {
        setCurrentTemplate(template);
        onChange({
            template,
            isCustom: template.isCustom ?? false,
            image: nextImage,
        });
    };

    const { t } = useTranslate();

    const handleThresholdChange = (valueInUnits: number) => {
        const inches =
            currentTemplate.measurementSystem === "imperial"
                ? valueInUnits
                : FieldProperties.centimetersToInches(valueInUnits);
        const template = new FieldProperties({
            ...currentTemplate,
            stepSizeWarningThresholdInches: inches,
        });
        setCurrentTemplate(template);
        onChange({ template, isCustom: template.isCustom ?? false, image });
    };

    return (
        // Choices on the left; the preview stays in view beside them on a wide screen
        <div className="grid w-full gap-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <div className="flex min-w-0 flex-col gap-16">
                {onEnsembleChange && (
                    <ActivityPicker
                        ensemble={ensemble}
                        onChange={onEnsembleChange}
                    />
                )}
                {showFloorPicker ? (
                    <IndoorFloorPicker
                        template={currentTemplate}
                        image={image}
                        drawn={drawnImage}
                        onChange={handleTemplateChange}
                        onOtherFields={() => setAllFields(true)}
                    />
                ) : (
                    <div className="flex flex-col gap-8">
                        <FieldPropertiesSelector
                            currentTemplate={currentTemplate}
                            onTemplateChange={(template) =>
                                handleTemplateChange(template)
                            }
                        />
                        {indoor && (
                            <Button
                                size="compact"
                                variant="secondary"
                                className="self-start"
                                onClick={() => {
                                    setAllFields(false);
                                    if (indoorFloorOf(currentTemplate) === null)
                                        handleTemplateChange(defaultTemplate);
                                }}
                                data-testid="indoor-floor-back"
                            >
                                <T keyName="fieldProperties.indoorFloor.backToFloors" />
                            </Button>
                        )}
                    </div>
                )}
            </div>
            <div className="flex min-w-0 flex-col gap-16 lg:sticky lg:top-0 lg:self-start">
                <div className="flex flex-col gap-8">
                    <span className="text-body text-text font-medium">
                        <T keyName="launchpage.files.fieldPreview" />
                    </span>
                    <FieldPreview
                        fieldProperties={currentTemplate}
                        image={drawnImage ?? undefined}
                        className="h-[260px]"
                    />
                </div>
                <div className="flex flex-col gap-8">
                    <span className="text-body text-text font-medium">
                        {t("fieldProperties.labels.stepSizeWarningThreshold")}
                    </span>
                    <UnitInput
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*\.?[0-9]*"
                        unit={
                            currentTemplate.measurementSystem === "imperial"
                                ? t("fieldProperties.units.inches")
                                : t("fieldProperties.units.centimeters")
                        }
                        onBlur={(e) => {
                            if (e.target.value === "") return;
                            const parsed = parseFloat(e.target.value);
                            if (!isNaN(parsed)) handleThresholdChange(parsed);
                        }}
                        onChange={(e) => {
                            const filtered = e.target.value.replace(
                                /[^\d.]/g,
                                "",
                            );
                            e.target.value = filtered.replace(/\.+/g, ".");
                        }}
                        defaultValue={
                            currentTemplate.stepSizeWarningThresholdInUnits
                        }
                        key={currentTemplate.name}
                    />
                </div>
            </div>
        </div>
    );
}
