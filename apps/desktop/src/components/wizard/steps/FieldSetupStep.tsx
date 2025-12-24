import { useState, useEffect } from "react";
import FieldPropertiesSelector from "@/components/field/FieldPropertiesSelector";
import FieldPropertiesCustomizer from "@/components/field/FieldPropertiesCustomizer";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { useQuery } from "@tanstack/react-query";
import { fieldPropertiesQueryOptions } from "@/hooks/queries";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

export default function FieldSetupStep() {
    const { wizardState, updateField } = useGuidedSetupStore();

    // Initialize with default template
    const defaultTemplate =
        FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

    const [currentTemplate, setCurrentTemplate] = useState<FieldProperties>(
        wizardState?.field?.template || defaultTemplate,
    );

    // Initialize with default template if not set
    useEffect(() => {
        if (!wizardState?.field) {
            setCurrentTemplate(defaultTemplate);
            updateField({
                template: defaultTemplate,
                isCustom: false,
            });
        } else if (wizardState.field.template) {
            setCurrentTemplate(wizardState.field.template);
        }
    }, [wizardState, updateField]);

    const environment = wizardState?.ensemble?.environment || "outdoor";

    const handleTemplateChange = (template: FieldProperties) => {
        setCurrentTemplate(template);
        updateField({
            template,
            isCustom: template.isCustom ?? false,
        });
    };

    // Ensure currentTemplate is always defined before rendering
    if (!currentTemplate) {
        return <div>Loading field properties...</div>;
    }

    return (
        <div className="flex flex-col gap-16">
            <FieldPropertiesSelector
                environment={environment}
                onTemplateChange={handleTemplateChange}
                currentTemplate={currentTemplate}
            />
            {currentTemplate.isCustom && (
                <div className="mt-8">
                    <FieldPropertiesCustomizer
                        currentTemplate={currentTemplate}
                    />
                </div>
            )}
        </div>
    );
}
