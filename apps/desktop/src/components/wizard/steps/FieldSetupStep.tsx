import { useState, useEffect } from "react";
import FieldPropertiesSelector from "@/components/field/FieldPropertiesSelector";
import FieldPropertiesCustomizer from "@/components/field/FieldPropertiesCustomizer";
import FieldPreview from "@/components/field/FieldPreview";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

export default function FieldSetupStep() {
    const { wizardState, updateField } = useGuidedSetupStore();

    const environment = wizardState?.ensemble?.environment || "outdoor";

    const defaultTemplate =
        environment === "indoor"
            ? FieldPropertiesTemplates.INDOOR_50x80_8to5
            : FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

    const [currentTemplate, setCurrentTemplate] = useState<FieldProperties>(
        wizardState?.field?.template || defaultTemplate,
    );

    useEffect(() => {
        if (!wizardState?.field) {
            setCurrentTemplate(defaultTemplate);
            updateField({ template: defaultTemplate, isCustom: false });
        } else if (wizardState.field.template) {
            setCurrentTemplate(wizardState.field.template);
        }
    }, [wizardState, updateField, defaultTemplate]);

    const handleTemplateChange = (template: FieldProperties) => {
        setCurrentTemplate(template);
        updateField({ template, isCustom: template.isCustom ?? false });
    };

    if (!currentTemplate) return <div>Loading field properties...</div>;

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-32">
            <FieldPropertiesSelector
                environment={environment}
                onTemplateChange={handleTemplateChange}
                currentTemplate={currentTemplate}
            />

            <div className="flex flex-col gap-16">
                <h5 className="text-body text-text font-medium">Preview</h5>
                <FieldPreview
                    fieldProperties={currentTemplate}
                    className="h-[200px]"
                    disableBackground={true}
                />
            </div>

            {currentTemplate.isCustom && (
                <FieldPropertiesCustomizer currentTemplate={currentTemplate} />
            )}
        </div>
    );
}
