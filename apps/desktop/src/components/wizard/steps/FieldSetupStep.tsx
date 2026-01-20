import { useState, useEffect } from "react";
import FieldPropertiesSelector from "@/components/field/FieldPropertiesSelector";
import FieldPropertiesCustomizer from "@/components/field/FieldPropertiesCustomizer";
import FieldPreview from "@/components/field/FieldPreview";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

export default function FieldSetupStep() {
    const wizardState = useGuidedSetupStore((state) => state.wizardState);
    const updateField = useGuidedSetupStore((state) => state.updateField);
    const wizardField = wizardState?.field;
    const environment = wizardState?.ensemble?.environment || "outdoor";

    const defaultTemplate =
        environment === "indoor"
            ? FieldPropertiesTemplates.INDOOR_50x80_8to5
            : FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

    const [currentTemplate, setCurrentTemplate] = useState<FieldProperties>(
        wizardField?.template || defaultTemplate,
    );

    useEffect(() => {
        if (!wizardField) {
            setCurrentTemplate(defaultTemplate);
            updateField({ template: defaultTemplate, isCustom: false });
        } else if (wizardField.template) {
            setCurrentTemplate(wizardField.template);
        }
        // updateField is stable (zustand). We intentionally exclude it to avoid effect re-runs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wizardField?.template, defaultTemplate]);

    const handleTemplateChange = (template: FieldProperties) => {
        setCurrentTemplate(template);
        updateField({ template, isCustom: template.isCustom ?? false });
    };

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
