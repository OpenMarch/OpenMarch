import { useEffect, useRef, useState } from "react";
import { FieldProperties } from "@openmarch/core";
import { UnitInput } from "@openmarch/ui";
import FieldPropertiesSelector from "@/components/field/FieldPropertiesSelector";
import FieldPreview from "@/components/field/FieldPreview";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { NewShowEnsembleData, NewShowFieldData } from "../../newShowTypes";
import { T, useTolgee } from "@tolgee/react";

interface FieldStepProps {
    ensemble: NewShowEnsembleData | null;
    field: NewShowFieldData | null;
    onChange: (field: NewShowFieldData) => void;
}

export default function FieldStep({
    ensemble,
    field,
    onChange,
}: FieldStepProps) {
    const environment = ensemble?.environment ?? "outdoor";
    const defaultTemplate =
        environment === "indoor"
            ? FieldPropertiesTemplates.INDOOR_50x80_8to5
            : FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

    const [currentTemplate, setCurrentTemplate] = useState<FieldProperties>(
        field?.template ?? defaultTemplate,
    );
    const prevEnvironment = useRef(environment);
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

        if (prevEnvironment.current === environment) return;
        prevEnvironment.current = environment;
        setCurrentTemplate(defaultTemplate);
        onChange({
            template: defaultTemplate,
            isCustom: defaultTemplate.isCustom ?? false,
        });
    }, [environment, field, defaultTemplate, onChange]);

    const handleTemplateChange = (template: FieldProperties) => {
        setCurrentTemplate(template);
        onChange({
            template,
            isCustom: template.isCustom ?? false,
        });
    };

    const { t } = useTolgee();

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
        onChange({ template, isCustom: template.isCustom ?? false });
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-16">
            <FieldPropertiesSelector
                environment={environment}
                currentTemplate={currentTemplate}
                onTemplateChange={handleTemplateChange}
            />
            <div className="flex flex-col gap-8">
                <span className="text-body text-text font-medium">
                    <T keyName="launchpage.files.fieldPreview" />
                </span>
                <FieldPreview
                    fieldProperties={currentTemplate}
                    className="h-[200px]"
                    disableBackground
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
                            ? "in"
                            : "cm"
                    }
                    onBlur={(e) => {
                        if (e.target.value === "") return;
                        const parsed = parseFloat(e.target.value);
                        if (!isNaN(parsed)) handleThresholdChange(parsed);
                    }}
                    onChange={(e) => {
                        const filtered = e.target.value.replace(/[^\d.]/g, "");
                        e.target.value = filtered.replace(/\.+/g, ".");
                    }}
                    defaultValue={
                        currentTemplate.stepSizeWarningThresholdInUnits
                    }
                    key={currentTemplate.name}
                />
            </div>
        </div>
    );
}
